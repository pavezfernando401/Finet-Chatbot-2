import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { ChatService } from '../chat/chat.service.js';
import {
  Conversation,
  ConversationStore,
  Identity,
} from '../chat/conversation.store.js';
import {
  numberSetting,
  optionalSetting,
  requireSetting,
} from '../config/env.js';
import { CatalogService } from '../knowledge/catalog.service.js';
import { finetContext } from '../knowledge/finet.texts.js';
import type { SupportCategory } from '../customers/customer.types.js';
import { CustomersService } from '../customers/customers.service.js';
import { extractRut } from '../customers/rut.js';
import {
  ChatwootContentType,
  ChatwootMessageType,
} from './chatwoot/chatwoot.types.js';
import {
  accountContext,
  accountTool,
  accountUnavailableText,
} from './account.js';
import {
  ENGINE_DOWN_LEAD,
  ENGINE_DOWN_REASON,
  engineDownText,
  HANDOFF_TOOL,
  handoffReason,
  handoffText,
  handoffTool,
  ticketFailedText,
  ticketFiledText,
} from './handoff.js';
import {
  anonymousContext,
  identifiedContext,
  RUT_NOT_VERIFIED,
  RUT_PLACEHOLDER,
  RUT_REQUEST,
} from './identity.texts.js';
import {
  IncomingMessage,
  MessageChannel,
  MessageReply,
  WebMessage,
  WebReply,
} from './message.types.js';
import {
  CREATE_SUPPORT_TOOL,
  createSupportTool,
  findCategory,
  MAX_DESCRIPTION,
  SUPPORT_CATEGORIES_TOOL,
  SUPPORT_DESCRIPTION_MISSING,
  SUPPORT_LOGIN_REQUIRED,
  SUPPORT_SESSION_INVALID,
  supportCategoriesContext,
  supportCategoriesTool,
  supportConfirmation,
  supportUnavailableText,
  unknownCategoryText,
} from './support.js';

/** What one turn produces: the reply, and the conversation to store. */
interface Outcome {
  reply: string;
  conversation: Conversation;
}

/** What the customer gets back. `null` once the conversation was handed off. */
type Answer = { content: string; handedOff: boolean } | null;

/** The engine's part of a turn: the text, and whether it ends the conversation. */
interface Generated {
  text: string;
  handedOff: boolean;
  /**
   * Set when the turn hands the customer to a person, which files a ticket
   * for an identified customer (CU-77). `reason` goes into the ticket;
   * `lead` goes in front of what the customer is told.
   */
  escalation?: { reason?: string; lead?: string };
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  /** In-flight work per conversation. See {@link serialise}. */
  private readonly chains = new Map<string, Promise<unknown>>();

  private readonly handoffReply: string;
  private readonly accountUnavailableReply: string;
  private readonly engineDownReply: string;
  private readonly supportUnavailableReply: string;
  private readonly ticketFailedReply: string;

  /**
   * CU-65's defined wait: the engine's whole part of a turn — retries and
   * CU-64's second call included — has to fit in it. Below the 60 s the
   * site's backend waits, less the 5 s a RUT check can take before it.
   */
  private readonly replyTimeoutMs: number;

  private readonly whatsapp: string;
  /** The public site, which the engine points customers to. */
  private readonly site: string;

  constructor(
    private readonly chat: ChatService,
    private readonly conversations: ConversationStore,
    private readonly customers: CustomersService,
    private readonly catalog: CatalogService,
    config: ConfigService,
  ) {
    const whatsapp = requireSetting(config, 'WHATSAPP_NUMBER');
    this.whatsapp = whatsapp;
    this.site = (
      optionalSetting(config, 'SITE_URL') ?? 'https://finet.cl'
    ).replace(/\/+$/, '');
    this.handoffReply = handoffText(whatsapp);
    this.accountUnavailableReply = accountUnavailableText(whatsapp);
    this.engineDownReply = engineDownText(whatsapp);
    this.supportUnavailableReply = supportUnavailableText(whatsapp);
    this.ticketFailedReply = ticketFailedText(whatsapp);
    this.replyTimeoutMs = numberSetting(config, 'REPLY_TIMEOUT_MS', 45_000);
  }

  /**
   * Entry point for Chatwoot-shaped messages: the webhook and the direct API.
   * `null` when there is nothing to send: the conversation was handed off.
   */
  async handleIncoming(message: IncomingMessage): Promise<MessageReply | null> {
    const answer = await this.converse(
      ConversationStore.key(
        message.channel,
        message.accountId,
        message.conversationId,
      ),
      message.content,
    );
    if (!answer) return null;

    return {
      accountId: message.accountId,
      conversationId: message.conversationId,
      message: {
        content: answer.content,
        message_type: ChatwootMessageType.Outgoing,
        private: false,
        content_type: ChatwootContentType.Text,
      },
    };
  }

  /** Entry point for the site's chat widget. */
  async handleWeb(message: WebMessage): Promise<WebReply> {
    const answer = await this.converse(
      ConversationStore.key(MessageChannel.Web, message.sessionId),
      message.content,
      message.accessToken,
    );

    return answer ?? { content: null, handedOff: true };
  }

  /** Adds one user turn to the conversation under `key` and returns the answer. */
  private converse(
    key: string,
    content: string,
    accessToken?: string,
  ): Promise<Answer> {
    return this.serialise(key, async () => {
      const conversation = this.conversations.get(key);

      // Handed off: the customer was sent to a person, so the message gets
      // no answer and is not kept — not in the history, not in the log.
      // Not saving also leaves the idle clock running from the handoff.
      if (conversation.handedOff) {
        this.logger.log(`${key} · handed off, message dropped`);
        return null;
      }

      // Message bodies are the customer's own words, so only their size goes
      // in the log. Turn on debug to see the text while developing.
      this.logger.log(`${key} · ${content.length} chars`);
      this.logger.debug(`${key} · ${content}`);
      const outcome = await this.respond(
        key,
        conversation,
        content,
        accessToken,
      );

      // Written back only once there is an answer, so a failed engine call
      // does not leave a dangling user turn that the retry would duplicate.
      this.conversations.save(key, outcome.conversation);
      return {
        content: outcome.reply,
        handedOff: outcome.conversation.handedOff,
      };
    });
  }

  /**
   * CU-63: a new conversation opens by asking for the RUT. A valid RUT is
   * checked against Finet's records and, if it matches, later answers use
   * the customer's data. Anything else — no RUT, one not on record, the
   * records not answering — leaves the bot answering general questions.
   */
  private async respond(
    key: string,
    conversation: Conversation,
    content: string,
    accessToken?: string,
  ): Promise<Outcome> {
    const { identity } = conversation;
    const found = extractRut(content);

    if (identity.status === 'new' && !found) {
      return this.say(conversation, content, RUT_REQUEST, {
        status: 'awaiting_rut',
      });
    }

    const turn = found
      ? content.replace(found.match, RUT_PLACEHOLDER)
      : content;
    // No cap on how many RUTs a conversation tries: the site's public debt
    // lookup (CU-39) has none either, only the rate limit per IP, and the
    // widget's messages go through one of those.
    if (found && identity.status !== 'identified') {
      const lookup = await this.customers.lookup(found.rut);
      this.logger.log(`${key} · RUT check: ${lookup.status}`);

      if (lookup.status === 'found') {
        return this.answer(
          key,
          conversation,
          turn,
          {
            status: 'identified',
            customer: lookup.customer,
            rut: found.rut,
          },
          undefined,
          accessToken,
        );
      }
      return this.answer(
        key,
        conversation,
        turn,
        { status: 'anonymous' },
        RUT_NOT_VERIFIED,
        accessToken,
      );
    }

    // Asked for a RUT and got something else: the customer carries on
    // without identifying, which is how the RUT is skipped.
    const next: Identity =
      identity.status === 'new' || identity.status === 'awaiting_rut'
        ? { status: 'anonymous' }
        : identity;
    return this.answer(key, conversation, turn, next, undefined, accessToken);
  }

  /**
   * Replies with the engine, given who the customer is. The engine can also
   * hand the customer to a person, which ends the conversation, or, for an
   * identified customer, look their account up (CU-64). An engine that fails
   * or runs out of time hands the customer off too (CU-65, exception 1).
   */
  private async answer(
    key: string,
    conversation: Conversation,
    content: string,
    identity: Identity,
    notice?: string,
    accessToken?: string,
  ): Promise<Outcome> {
    const turn: ChatCompletionMessageParam = { role: 'user', content };
    const history = [...conversation.turns, turn];
    const customerContext =
      identity.status === 'identified'
        ? identifiedContext(identity.customer)
        : anonymousContext({ justFailed: notice !== undefined });

    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), this.replyTimeoutMs);
    let generated: Generated;
    try {
      // Read inside the turn's deadline, so the reply still fits in what
      // the site waits. Cached, so usually instant; never throws.
      const context = `${finetContext({
        plans: await this.catalog.plans(),
        site: this.site,
        whatsapp: this.whatsapp,
      })}\n\n${customerContext}`;
      generated = await this.generate(
        key,
        history,
        context,
        identity,
        deadline.signal,
        accessToken,
      );
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      this.logger.warn(`${key} · engine gave no answer, handed off`);
      generated = {
        text: this.engineDownReply,
        handedOff: true,
        escalation: { reason: ENGINE_DOWN_REASON, lead: ENGINE_DOWN_LEAD },
      };
    } finally {
      clearTimeout(timer);
    }

    // CU-77: the ticket needs a customer, so only an identified one gets it;
    // anyone else keeps the pointer to WhatsApp. Filed after the engine's
    // deadline, on its own 5 s: still inside the 60 s the site waits.
    if (generated.escalation && identity.status === 'identified') {
      generated = {
        text: await this.fileTicket(
          key,
          identity.rut,
          history,
          generated.escalation,
        ),
        handedOff: true,
      };
    }

    const { handedOff } = generated;
    const reply = notice ? `${notice}\n\n${generated.text}` : generated.text;

    // Only the answer goes in the history, not the lookup: the figures are
    // in what the customer was told, and the next question looks them up
    // again rather than trusting an old balance.
    return {
      reply,
      conversation: {
        turns: [...history, { role: 'assistant', content: reply }],
        identity,
        handedOff,
      },
    };
  }

  /** One engine turn, and whatever tool the engine asked for. */
  private async generate(
    key: string,
    history: ChatCompletionMessageParam[],
    context: string,
    identity: Identity,
    signal: AbortSignal,
    accessToken?: string,
  ): Promise<Generated> {
    const completion = await this.chat.complete(
      history,
      context,
      this.tools(identity, accessToken),
      signal,
    );

    if (completion.type === 'text') {
      return { text: completion.content, handedOff: false };
    }
    if (completion.name === HANDOFF_TOOL) {
      return this.handOff(completion.arguments);
    }
    // The support tools are only offered to an identified customer.
    if (identity.status === 'identified') {
      if (completion.name === SUPPORT_CATEGORIES_TOOL) {
        return this.reportFailure(
          key,
          history,
          context,
          identity.rut,
          signal,
          accessToken,
        );
      }
      if (completion.name === CREATE_SUPPORT_TOOL) {
        return accessToken
          ? this.fileSupportRequest(
              key,
              completion.arguments,
              { rut: identity.rut, accessToken },
              signal,
            )
          : { text: SUPPORT_LOGIN_REQUIRED, handedOff: false };
      }
    }
    return {
      text: await this.answerFromAccount(
        key,
        history,
        context,
        identity,
        signal,
      ),
      handedOff: false,
    };
  }

  /**
   * What the engine may call. Reporting a failure is offered to any
   * identified customer, so one without a portal session is told to log in
   * (CU-66); filing it, only to one who has it.
   */
  private tools(
    identity: Identity,
    accessToken?: string,
  ): ChatCompletionFunctionTool[] {
    if (identity.status !== 'identified') return [handoffTool];
    const tools = [handoffTool, accountTool, supportCategoriesTool];
    return accessToken ? [...tools, createSupportTool] : tools;
  }

  /** The engine asked for a person. The text is replaced if a ticket is filed. */
  private handOff(args: Record<string, unknown>): Generated {
    return {
      text: this.handoffReply,
      handedOff: true,
      escalation: { reason: handoffReason(args) },
    };
  }

  /**
   * CU-77: files a support ticket with the conversation so far and tells the
   * customer its code. Finet's team picks it up from the CRM; the bot does not
   * assign anyone. If it cannot be filed (exception 1) the customer is told a
   * person will attend them shortly, with WhatsApp to make sure of it.
   */
  private async fileTicket(
    key: string,
    rut: string,
    history: ChatCompletionMessageParam[],
    escalation: NonNullable<Generated['escalation']>,
  ): Promise<string> {
    const ticket = await this.customers.escalate({
      rut,
      sessionId: key,
      channel: ConversationStore.channel(key),
      // Cut to what finet-clientes takes per turn: one long engine answer
      // must not cost the whole ticket.
      history: history.flatMap((turn) =>
        (turn.role === 'user' || turn.role === 'assistant') &&
        typeof turn.content === 'string' &&
        turn.content
          ? [{ role: turn.role, content: turn.content.slice(0, 5_000) }]
          : [],
      ),
      reason: escalation.reason,
    });
    this.logger.log(
      `${key} · escalation ticket: ${ticket ? 'filed' : 'failed'}`,
    );

    const text = ticket
      ? ticketFiledText(ticket.codigo_seguimiento)
      : this.ticketFailedReply;
    return escalation.lead ? `${escalation.lead} ${text}` : text;
  }

  /**
   * CU-66: the customer reports a failure. Looks the categories up and lets
   * the engine present them and gather the report; if the customer already
   * gave all of it, the engine can file the request right away.
   */
  private async reportFailure(
    key: string,
    history: ChatCompletionMessageParam[],
    context: string,
    rut: string,
    signal: AbortSignal,
    accessToken?: string,
  ): Promise<Generated> {
    // Checked before the categories: without a session the request could
    // not be filed at the end, and the customer would describe it for nothing.
    if (!accessToken) {
      this.logger.log(`${key} · failure report: no portal session`);
      return { text: SUPPORT_LOGIN_REQUIRED, handedOff: false };
    }

    const categories = await this.customers.supportCategories(signal);
    this.logger.log(
      `${key} · support categories: ${categories ? 'found' : 'unavailable'}`,
    );
    if (!categories) return this.supportUnavailable();

    const completion = await this.chat.complete(
      history,
      `${context}\n\n${supportCategoriesContext(categories)}`,
      [handoffTool, createSupportTool],
      signal,
    );
    if (completion.type === 'text') {
      return { text: completion.content, handedOff: false };
    }
    if (completion.name === HANDOFF_TOOL) {
      return this.handOff(completion.arguments);
    }
    return this.fileSupportRequest(
      key,
      completion.arguments,
      { rut, accessToken },
      signal,
      categories,
    );
  }

  /**
   * CU-66: files the request and gives the customer its identifier. The
   * category is resolved here from its name, against the list as it is now,
   * so one the engine misremembers is asked again rather than filed wrong.
   */
  private async fileSupportRequest(
    key: string,
    args: Record<string, unknown>,
    customer: { rut: string; accessToken: string },
    signal: AbortSignal,
    categories?: SupportCategory[],
  ): Promise<Generated> {
    const description =
      typeof args.descripcion === 'string' ? args.descripcion.trim() : '';
    if (!description) {
      return { text: SUPPORT_DESCRIPTION_MISSING, handedOff: false };
    }

    const list = categories ?? (await this.customers.supportCategories(signal));
    if (!list) return this.supportUnavailable();
    const category = findCategory(list, args.categoria);
    if (!category) {
      return { text: unknownCategoryText(list), handedOff: false };
    }

    const outcome = await this.customers.createSupport(
      {
        rut: customer.rut,
        sessionId: key,
        categoryId: category.id_categoria,
        description: description.slice(0, MAX_DESCRIPTION),
        accessToken: customer.accessToken,
      },
      signal,
    );
    this.logger.log(`${key} · support request: ${outcome.status}`);

    if (outcome.status === 'created') {
      return {
        text: supportConfirmation(outcome.ticket.codigo_seguimiento),
        handedOff: false,
      };
    }
    if (outcome.status === 'unauthorized') {
      return { text: SUPPORT_SESSION_INVALID, handedOff: false };
    }
    return this.supportUnavailable();
  }

  /**
   * CU-66, exception 1: the support section did not answer. The customer is
   * told a person will take the case, so the conversation is handed off.
   */
  private supportUnavailable(): Generated {
    return { text: this.supportUnavailableReply, handedOff: true };
  }

  /**
   * CU-64: looks the account up now and lets the engine answer with it. The
   * records failing gets a fixed text instead, the use case's exception 1.
   */
  private async answerFromAccount(
    key: string,
    history: ChatCompletionMessageParam[],
    context: string,
    identity: Identity,
    signal: AbortSignal,
  ): Promise<string> {
    // The tool is only offered to an identified customer.
    if (identity.status !== 'identified') return this.accountUnavailableReply;

    const lookup = await this.customers.account(identity.rut);
    this.logger.log(`${key} · account lookup: ${lookup.status}`);
    if (lookup.status !== 'found') return this.accountUnavailableReply;

    // No tools this time, so the engine has to answer in words.
    const completion = await this.chat.complete(
      history,
      `${context}\n\n${accountContext(lookup.account)}`,
      [],
      signal,
    );
    return completion.type === 'text'
      ? completion.content
      : this.accountUnavailableReply;
  }

  /** Replies with a fixed text, without the engine. */
  private say(
    conversation: Conversation,
    content: string,
    reply: string,
    identity: Identity,
  ): Outcome {
    return {
      reply,
      conversation: {
        turns: [
          ...conversation.turns,
          { role: 'user', content },
          { role: 'assistant', content: reply },
        ],
        identity,
        handedOff: false,
      },
    };
  }

  /**
   * Runs one conversation's messages one after another.
   *
   * Reading the history, calling the engine and writing the answer back is a
   * read-modify-write around an await. Two messages arriving close together —
   * a customer sending a second line before the first is answered — would
   * both read the same history, and the later write would drop the earlier
   * turn for good.
   */
  private serialise<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);

    // The stored link never rejects, so one failed message does not reject
    // the next one queued behind it.
    const link = result.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(key, link);
    void link.then(() => {
      if (this.chains.get(key) === link) this.chains.delete(key);
    });

    return result;
  }
}
