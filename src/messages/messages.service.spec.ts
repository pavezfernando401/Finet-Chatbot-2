import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from '../chat/chat.service.js';
import { ConversationStore } from '../chat/conversation.store.js';
import type { CustomerLookup } from '../customers/customer.types.js';
import { CustomersService } from '../customers/customers.service.js';
import { CatalogService } from '../knowledge/catalog.service.js';
import {
  ACCOUNT_TOOL,
  accountTool,
  accountUnavailableText,
} from './account.js';
import { ChatwootContentType } from './chatwoot/chatwoot.types.js';
import {
  ENGINE_DOWN_LEAD,
  ENGINE_DOWN_REASON,
  engineDownText,
  HANDOFF_TOOL,
  handoffText,
  handoffTool,
  ticketFailedText,
  ticketFiledText,
} from './handoff.js';
import {
  RUT_NOT_VERIFIED,
  RUT_PLACEHOLDER,
  RUT_REQUEST,
} from './identity.texts.js';
import { MessageChannel } from './message.types.js';
import { MessagesService } from './messages.service.js';
import {
  CREATE_SUPPORT_TOOL,
  createSupportTool,
  SUPPORT_CATEGORIES_TOOL,
  SUPPORT_LOGIN_REQUIRED,
  SUPPORT_SESSION_INVALID,
  supportCategoriesTool,
  supportConfirmation,
  supportUnavailableText,
  unknownCategoryText,
} from './support.js';

const RUT = '12.345.678-5';
const WHATSAPP = '+56 9 4500 2319';
const SESSION = '3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64';
const CHATWOOT_KEY = ConversationStore.key(MessageChannel.Chatwoot, 1, 12);

const message = (content: string, conversationId = 12) => ({
  channel: MessageChannel.Chatwoot,
  accountId: 1,
  conversationId,
  content,
  contentType: ChatwootContentType.Text,
  contentAttributes: {},
  sender: { id: 7 },
  createdAt: new Date(),
});

/** What the engine double answers: text, or the handoff. */
const text = (content: string) => ({ type: 'text', content });
const handoff = { type: 'tool', name: HANDOFF_TOOL, arguments: {} };
const consultAccount = { type: 'tool', name: ACCOUNT_TOOL, arguments: {} };

const found: CustomerLookup = {
  status: 'found',
  customer: {
    name: 'Juan Pérez',
    plans: [
      {
        name: 'Fibra 600',
        type: 'fibra',
        speedMbps: 600,
        contractStatus: 'activo',
      },
    ],
  },
};

describe('MessagesService', () => {
  let service: MessagesService;
  let store: ConversationStore;
  let complete: ReturnType<typeof vi.fn>;
  let lookup: ReturnType<typeof vi.fn>;
  let account: ReturnType<typeof vi.fn>;
  let escalate: ReturnType<typeof vi.fn>;
  let supportCategories: ReturnType<typeof vi.fn>;
  let createSupport: ReturnType<typeof vi.fn>;
  let plans: ReturnType<typeof vi.fn>;

  /** Puts a conversation past the RUT step, for tests about something else. */
  const skipIdentification = (key = CHATWOOT_KEY) =>
    store.save(key, {
      turns: [],
      identity: { status: 'anonymous' },
      handedOff: false,
    });

  const reply = async (content: string) =>
    (await service.handleIncoming(message(content)))?.message.content;

  /** The history, context and tools of the last engine call. */
  const lastCall = () => {
    const [history, context, tools] = complete.mock.lastCall as [
      { role: string; content: string }[],
      string,
      unknown[],
    ];
    return { history, context, tools };
  };

  beforeEach(async () => {
    complete = vi.fn().mockResolvedValue(text('respuesta'));
    plans = vi.fn().mockResolvedValue([
      {
        name: 'Fibra 600',
        type: 'internet',
        segment: 'residencial',
        speedMbps: 600,
        monthlyPrice: 19990,
        description: null,
      },
    ]);
    lookup = vi.fn().mockResolvedValue(found);
    escalate = vi.fn().mockResolvedValue({
      id_ticket: 123,
      codigo_seguimiento: 'FIN-2026-000123',
    });
    supportCategories = vi.fn().mockResolvedValue([
      { id_categoria: 2, nombre: 'Falla de Internet' },
      { id_categoria: 3, nombre: 'Facturación y cobro' },
    ]);
    createSupport = vi.fn().mockResolvedValue({
      status: 'created',
      ticket: { id_ticket: 124, codigo_seguimiento: 'FIN-2026-000124' },
    });
    account = vi.fn().mockResolvedValue({
      status: 'found',
      account: {
        balance: 45990,
        invoices: [
          {
            period: 'Agosto 2026',
            amount: 45990,
            dueDate: '2026-09-20',
            status: 'vencida',
            daysOverdue: 12,
            daysToDue: null,
          },
        ],
        complete: true,
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        ConversationStore,
        { provide: ChatService, useValue: { complete } },
        {
          provide: CustomersService,
          useValue: {
            lookup,
            account,
            escalate,
            supportCategories,
            createSupport,
          },
        },
        { provide: CatalogService, useValue: { plans } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({ WHATSAPP_NUMBER: WHATSAPP, REPLY_TIMEOUT_MS: '45000' })[key],
          },
        },
      ],
    }).compile();

    service = module.get(MessagesService);
    store = module.get(ConversationStore);
  });

  it('answers shaped for Chatwoot', async () => {
    skipIdentification();

    expect(await service.handleIncoming(message('hola'))).toEqual({
      accountId: 1,
      conversationId: 12,
      message: {
        content: 'respuesta',
        message_type: 'outgoing',
        private: false,
        content_type: 'text',
      },
    });
  });

  describe('CU-63: asking for the RUT', () => {
    it('opens a new conversation by asking for the RUT, without the engine', async () => {
      expect(await reply('¿cuánto pago al mes?')).toBe(RUT_REQUEST);
      expect(complete).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
    });

    it('identifies the customer and answers the pending question with their data', async () => {
      await reply('¿qué plan tengo?');

      expect(await reply(RUT)).toBe('respuesta');
      expect(lookup).toHaveBeenCalledWith('123456785');

      const { history, context } = lastCall();
      expect(history).toEqual([
        { role: 'user', content: '¿qué plan tengo?' },
        { role: 'assistant', content: RUT_REQUEST },
        { role: 'user', content: RUT_PLACEHOLDER },
      ]);
      expect(context).toContain('Juan Pérez');
      expect(context).toContain('Fibra 600 (fibra, 600 Mbps), contrato activo');
    });

    it('never lets the RUT reach the engine', async () => {
      await reply('hola');
      await reply(`mi rut es ${RUT}, ¿qué plan tengo?`);
      await reply('gracias');

      const sent = JSON.stringify(complete.mock.calls);
      expect(sent).not.toContain('12.345.678');
      expect(sent).toContain(`mi rut es ${RUT_PLACEHOLDER}, ¿qué plan tengo?`);
    });

    it('takes a RUT that comes with the very first message', async () => {
      expect(await reply(`hola, mi rut es ${RUT}`)).toBe('respuesta');
      expect(lookup).toHaveBeenCalledWith('123456785');
      expect(lastCall().context).toContain('Juan Pérez');
    });

    it('keeps the customer identified for the rest of the conversation', async () => {
      await reply('hola');
      await reply(RUT);
      await reply('¿y mi velocidad?');

      expect(lookup).toHaveBeenCalledTimes(1);
      expect(lastCall().context).toContain('Juan Pérez');
    });

    it('goes on with general answers when the customer skips the RUT', async () => {
      await reply('¿cuánto pago al mes?');

      expect(await reply('prefiero no darlo')).toBe('respuesta');
      expect(lookup).not.toHaveBeenCalled();
      expect(lastCall().context).toContain('no está identificado');
    });

    it.each<[string, CustomerLookup]>([
      ['is not on record', { status: 'not_found' }],
      ['cannot be checked', { status: 'unavailable' }],
    ])(
      'says it could not verify the customer when the RUT %s',
      async (_, outcome) => {
        lookup.mockResolvedValue(outcome);
        await reply('hola');

        expect(await reply(RUT)).toBe(`${RUT_NOT_VERIFIED}\n\nrespuesta`);
        expect(lastCall().context).toContain('no está identificado');
        expect(lastCall().context).toContain('no lo repitas');
      },
    );

    it('lets a customer in general mode identify later', async () => {
      await reply('hola');
      await reply('¿qué planes tienen?');

      await reply(`ahora sí: ${RUT}`);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(lastCall().context).toContain('Juan Pérez');
    });

    it('checks every RUT it is given, like the public debt lookup', async () => {
      lookup.mockResolvedValue({ status: 'not_found' });
      await reply('hola');
      for (let i = 0; i < 5; i++) await reply(RUT);

      expect(lookup).toHaveBeenCalledTimes(5);

      lookup.mockResolvedValue(found);
      await reply(RUT);
      expect(lastCall().context).toContain('Juan Pérez');
    });

    it('asks again in a conversation that went idle for 48 hours', async () => {
      vi.useFakeTimers();
      try {
        await reply('hola');
        await reply(RUT);

        vi.advanceTimersByTime(48 * 60 * 60 * 1000 + 1);
        expect(await reply('hola de nuevo')).toBe(RUT_REQUEST);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('carries the earlier turns into the next call', async () => {
    skipIdentification();
    await reply('hola');
    await reply('¿y una hipoteca?');

    expect(lastCall().history).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'respuesta' },
      { role: 'user', content: '¿y una hipoteca?' },
    ]);
  });

  it('keeps conversations apart', async () => {
    skipIdentification();
    await reply('hola');

    // Conversation 99 is new: it gets the RUT request, not 12's history.
    const other = await service.handleIncoming(message('buenas', 99));
    expect(other?.message.content).toBe(RUT_REQUEST);
  });

  it('keeps the direct API out of a Chatwoot conversation history', async () => {
    skipIdentification();
    await reply('desde chatwoot');

    const fromApi = await service.handleIncoming({
      ...message('desde la api'),
      channel: MessageChannel.Api,
    });
    expect(fromApi?.message.content).toBe(RUT_REQUEST);
  });

  it('serialises two messages arriving in one conversation', async () => {
    skipIdentification();
    const seen: string[][] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));

    complete.mockImplementation(async (history: { content: string }[]) => {
      seen.push(history.map((h) => h.content));
      if (seen.length === 1) await gate;
      return text(`respuesta ${seen.length}`);
    });

    const first = service.handleIncoming(message('primera'));
    const second = service.handleIncoming(message('segunda'));
    release?.();
    await Promise.all([first, second]);

    // The second call must see what the first one wrote.
    expect(seen).toEqual([['primera'], ['primera', 'respuesta 1', 'segunda']]);
  });

  describe('CU-65: the engine gives no answer', () => {
    const engineDown = () =>
      complete.mockRejectedValue(
        new ServiceUnavailableException('The chat engine is unavailable'),
      );

    it('recommends WhatsApp and hands the conversation off', async () => {
      skipIdentification();
      engineDown();

      expect(await reply('hola')).toBe(engineDownText(WHATSAPP));
      expect(store.get(CHATWOOT_KEY).handedOff).toBe(true);
    });

    it('answers nothing after that, like any handoff', async () => {
      skipIdentification();
      engineDown();
      await reply('hola');
      complete.mockClear();

      await expect(
        service.handleIncoming(message('¿hola?')),
      ).resolves.toBeNull();
      expect(complete).not.toHaveBeenCalled();
    });

    it('keeps the RUT notice in front of it', async () => {
      lookup.mockResolvedValue({ status: 'not_found' });
      await reply('hola');
      engineDown();

      expect(await reply(RUT)).toBe(
        `${RUT_NOT_VERIFIED}\n\n${engineDownText(WHATSAPP)}`,
      );
    });

    it('gives the engine a deadline for the whole turn', async () => {
      vi.useFakeTimers();
      try {
        skipIdentification();
        complete.mockImplementation(
          (_h: unknown, _c: unknown, _t: unknown, signal: AbortSignal) =>
            new Promise((_, rejectCall) =>
              signal.addEventListener('abort', () =>
                rejectCall(new ServiceUnavailableException('aborted')),
              ),
            ),
        );

        const answer = reply('hola');
        await vi.advanceTimersByTimeAsync(45_000);
        expect(await answer).toBe(engineDownText(WHATSAPP));
      } finally {
        vi.useRealTimers();
      }
    });

    it('shares the deadline with the account lookup answer (CU-64)', async () => {
      await reply('hola');
      await reply(RUT);
      complete
        .mockResolvedValueOnce(consultAccount)
        .mockRejectedValueOnce(new ServiceUnavailableException('timeout'));

      // Identified, so the handoff files a ticket too (CU-77).
      expect(await reply('¿cuánto debo?')).toBe(
        `${ENGINE_DOWN_LEAD} ${ticketFiledText('FIN-2026-000123')}`,
      );
      const [first, second] = complete.mock.calls.slice(-2);
      expect(second[3]).toBe(first[3]);
    });

    it('still fails loudly on anything that is not the engine', async () => {
      skipIdentification();
      complete.mockRejectedValue(new TypeError('a bug'));

      await expect(service.handleIncoming(message('hola'))).rejects.toThrow(
        TypeError,
      );
      expect(store.get(CHATWOOT_KEY).turns).toEqual([]);
    });
  });

  describe('handing off to a person', () => {
    it('offers the engine the handoff on every call', async () => {
      skipIdentification();
      await reply('hola');

      expect(lastCall().tools).toEqual([handoffTool]);
    });

    it('recommends WhatsApp, with the configured number', async () => {
      skipIdentification();
      complete.mockResolvedValue(handoff);

      const answer = await reply('quiero hablar con una persona');
      expect(answer).toBe(handoffText(WHATSAPP));
      expect(answer).toContain(WHATSAPP);
    });

    it('keeps the RUT notice in front of the handoff', async () => {
      lookup.mockResolvedValue({ status: 'not_found' });
      complete.mockResolvedValue(handoff);
      await reply('hola');

      expect(await reply(`${RUT}, pásame con alguien`)).toBe(
        `${RUT_NOT_VERIFIED}\n\n${handoffText(WHATSAPP)}`,
      );
    });

    it('answers nothing after the handoff, without the engine', async () => {
      skipIdentification();
      complete.mockResolvedValue(handoff);
      await reply('quiero hablar con una persona');
      complete.mockClear();

      await expect(
        service.handleIncoming(message('¿sigues ahí?')),
      ).resolves.toBeNull();
      expect(complete).not.toHaveBeenCalled();
    });

    it('keeps nothing of what is sent after the handoff', async () => {
      skipIdentification();
      complete.mockResolvedValue(handoff);
      await reply('quiero hablar con una persona');
      const before = store.get(CHATWOOT_KEY);

      await reply('¿sigues ahí?');
      await reply(`mi rut es ${RUT}`);

      expect(store.get(CHATWOOT_KEY)).toEqual(before);
      expect(lookup).not.toHaveBeenCalled();
    });

    it('starts over 48 hours after the handoff, even if messages kept coming', async () => {
      vi.useFakeTimers();
      try {
        skipIdentification();
        complete.mockResolvedValue(handoff);
        await reply('quiero hablar con una persona');

        vi.advanceTimersByTime(47 * 60 * 60 * 1000);
        expect(await reply('¿hola?')).toBeUndefined();

        vi.advanceTimersByTime(60 * 60 * 1000 + 1);
        expect(await reply('hola de nuevo')).toBe(RUT_REQUEST);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('CU-77: a ticket when an identified customer is handed off', () => {
    const identify = async () => {
      await reply('hola');
      await reply(RUT);
    };

    it('files a ticket with the RUT, the history and the reason', async () => {
      await identify();
      complete.mockResolvedValue({
        type: 'tool',
        name: HANDOFF_TOOL,
        arguments: { motivo: '  Quiere dar de baja su plan  ' },
      });

      expect(await reply('quiero dar de baja mi plan')).toBe(
        ticketFiledText('FIN-2026-000123'),
      );
      expect(escalate).toHaveBeenCalledWith({
        rut: '123456785',
        sessionId: CHATWOOT_KEY,
        channel: 'chatwoot',
        history: [
          { role: 'user', content: 'hola' },
          { role: 'assistant', content: RUT_REQUEST },
          { role: 'user', content: RUT_PLACEHOLDER },
          { role: 'assistant', content: 'respuesta' },
          { role: 'user', content: 'quiero dar de baja mi plan' },
        ],
        reason: 'Quiere dar de baja su plan',
      });
      expect(store.get(CHATWOOT_KEY).handedOff).toBe(true);
    });

    it('never sends the RUT itself in the history', async () => {
      await identify();
      complete.mockResolvedValue(handoff);
      await reply('pásame con alguien');

      const sent = JSON.stringify(escalate.mock.calls[0][0].history);
      expect(sent).not.toContain('12.345.678');
    });

    it('files it without a reason when the engine gave none', async () => {
      await identify();
      complete.mockResolvedValue({
        type: 'tool',
        name: HANDOFF_TOOL,
        arguments: { motivo: '   ' },
      });
      await reply('pásame con alguien');

      expect(escalate.mock.calls[0][0].reason).toBeUndefined();
    });

    it('says a person will attend them shortly when the ticket fails (exception 1)', async () => {
      await identify();
      escalate.mockResolvedValue(null);
      complete.mockResolvedValue(handoff);

      const answer = await reply('pásame con alguien');
      expect(answer).toBe(ticketFailedText(WHATSAPP));
      expect(answer).toContain('en breve');
      expect(store.get(CHATWOOT_KEY).handedOff).toBe(true);
    });

    it('files one too when the engine gives no answer (CU-65)', async () => {
      await identify();
      complete.mockRejectedValue(
        new ServiceUnavailableException('The chat engine is unavailable'),
      );

      expect(await reply('¿hola?')).toBe(
        `${ENGINE_DOWN_LEAD} ${ticketFiledText('FIN-2026-000123')}`,
      );
      expect(escalate.mock.calls[0][0].reason).toBe(ENGINE_DOWN_REASON);
    });

    it('files nothing for a customer who did not identify', async () => {
      skipIdentification();
      complete.mockResolvedValue(handoff);

      expect(await reply('pásame con alguien')).toBe(handoffText(WHATSAPP));
      expect(escalate).not.toHaveBeenCalled();
    });

    it('files nothing more once handed off', async () => {
      await identify();
      complete.mockResolvedValue(handoff);
      await reply('pásame con alguien');
      await reply('¿sigues ahí?');

      expect(escalate).toHaveBeenCalledTimes(1);
    });

    it('tells the web widget apart by channel and session', async () => {
      await service.handleWeb({ sessionId: SESSION, content: 'hola' });
      await service.handleWeb({ sessionId: SESSION, content: RUT });
      complete.mockResolvedValue(handoff);

      await expect(
        service.handleWeb({
          sessionId: SESSION,
          content: 'pásame con alguien',
        }),
      ).resolves.toEqual({
        content: ticketFiledText('FIN-2026-000123'),
        handedOff: true,
      });
      expect(escalate).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: `web:${SESSION}`,
          channel: 'web',
        }),
      );
    });
  });

  describe('CU-64: balance and invoices', () => {
    /** Identifies the customer, then has the engine ask for the account. */
    const identify = async () => {
      await reply('hola');
      await reply(RUT);
      complete
        .mockResolvedValueOnce(consultAccount)
        .mockResolvedValueOnce(text('Debes $45.990.'));
    };

    it('offers the account lookup only to an identified customer', async () => {
      await reply('hola');
      await reply('prefiero no darlo');
      expect(lastCall().tools).toEqual([handoffTool]);

      await reply(RUT);
      expect(lastCall().tools).toEqual([
        handoffTool,
        accountTool,
        supportCategoriesTool,
      ]);
    });

    it('looks the account up with the stored RUT and answers with the engine', async () => {
      await identify();

      expect(await reply('¿cuánto debo?')).toBe('Debes $45.990.');
      expect(account).toHaveBeenCalledWith('123456785');

      const { context, tools } = lastCall();
      expect(context).toContain('Saldo pendiente: $45.990');
      expect(context).toContain('Agosto 2026');
      expect(context).toContain('vencida hace 12 días (vencía el 20-09-2026)');
      expect(tools).toEqual([]);
    });

    it('looks the account up again on every question', async () => {
      await identify();
      await reply('¿cuánto debo?');
      complete
        .mockResolvedValueOnce(consultAccount)
        .mockResolvedValueOnce(text('Sigues debiendo $45.990.'));

      await reply('¿y ahora?');
      expect(account).toHaveBeenCalledTimes(2);
    });

    it('keeps the answer in the history, not the lookup', async () => {
      await identify();
      await reply('¿cuánto debo?');

      expect(store.get(CHATWOOT_KEY).turns.slice(-2)).toEqual([
        { role: 'user', content: '¿cuánto debo?' },
        { role: 'assistant', content: 'Debes $45.990.' },
      ]);
    });

    it('never lets the RUT reach the engine', async () => {
      await identify();
      await reply('¿cuánto debo?');

      const sent = JSON.stringify(complete.mock.calls);
      expect(sent).not.toContain('12.345.678');
      expect(sent).not.toContain('123456785');
    });

    it.each([
      ['has no records for the RUT', { status: 'not_found' }],
      ['does not answer', { status: 'unavailable' }],
    ])(
      'says it could not get the information when finet-clientes %s',
      async (_, outcome) => {
        await identify();
        account.mockResolvedValue(outcome);
        complete.mockClear();
        complete.mockResolvedValueOnce(consultAccount);

        expect(await reply('¿cuánto debo?')).toBe(
          accountUnavailableText(WHATSAPP),
        );
        expect(complete).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('CU-66: reporting a failure', () => {
    const TOKEN = 'portal.jwt.token';
    const WEB_KEY = `web:${SESSION}`;

    const web = async (content: string, accessToken: string | null = TOKEN) =>
      service.handleWeb({
        sessionId: SESSION,
        content,
        ...(accessToken ? { accessToken } : {}),
      });

    const listCategories = {
      type: 'tool',
      name: SUPPORT_CATEGORIES_TOOL,
      arguments: {},
    };
    const fileRequest = (args: Record<string, unknown>) => ({
      type: 'tool',
      name: CREATE_SUPPORT_TOOL,
      arguments: args,
    });
    const report = {
      categoria: 'falla de internet',
      descripcion:
        'No tengo internet. Desde ayer, en Los Aromos 123; reinicié el router.',
    };

    /** An identified web customer, logged in to the portal. */
    const identify = async () => {
      await web('hola');
      await web(RUT);
      complete.mockClear();
    };

    it('offers filing a request only with a portal session', async () => {
      await identify();
      await web('hola');
      expect(lastCall().tools).toEqual([
        handoffTool,
        accountTool,
        supportCategoriesTool,
        createSupportTool,
      ]);

      await web('hola', null);
      expect(lastCall().tools).toEqual([
        handoffTool,
        accountTool,
        supportCategoriesTool,
      ]);
    });

    it('presents the categories for the customer to pick from', async () => {
      await identify();
      complete
        .mockResolvedValueOnce(listCategories)
        .mockResolvedValueOnce(text('¿Cuál de estas categorías...?'));

      await expect(web('tengo una falla')).resolves.toEqual({
        content: '¿Cuál de estas categorías...?',
        handedOff: false,
      });
      const { context, tools } = lastCall();
      expect(context).toContain('- Falla de Internet');
      expect(context).toContain('- Facturación y cobro');
      expect(context).toContain('desde cuándo ocurre');
      expect(tools).toEqual([handoffTool, createSupportTool]);
    });

    it('files the request under the chosen category and gives its identifier', async () => {
      await identify();
      complete.mockResolvedValueOnce(fileRequest(report));

      await expect(web('desde ayer, reinicié el router')).resolves.toEqual({
        content: supportConfirmation('FIN-2026-000124'),
        handedOff: false,
      });
      expect(createSupport).toHaveBeenCalledWith(
        {
          rut: '123456785',
          sessionId: WEB_KEY,
          categoryId: 2,
          description: report.descripcion,
          accessToken: TOKEN,
        },
        expect.any(AbortSignal),
      );
    });

    it('files it right away when the customer already gave everything', async () => {
      await identify();
      complete
        .mockResolvedValueOnce(listCategories)
        .mockResolvedValueOnce(fileRequest(report));

      expect((await web('sin conexión desde ayer...')).content).toBe(
        supportConfirmation('FIN-2026-000124'),
      );
      expect(supportCategories).toHaveBeenCalledTimes(1);
    });

    it('matches the category without minding case or accents', async () => {
      await identify();
      complete.mockResolvedValueOnce(
        fileRequest({ ...report, categoria: 'FACTURACION Y COBRO' }),
      );

      expect((await web('me cobraron dos veces')).content).toBe(
        supportConfirmation('FIN-2026-000124'),
      );
      expect(createSupport).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 3 }),
        expect.any(AbortSignal),
      );
    });

    it('asks again for a category that is not on the list', async () => {
      await identify();
      complete.mockResolvedValueOnce(
        fileRequest({ ...report, categoria: 'Telefonía' }),
      );

      const { content } = await web('la de teléfono');
      expect(content).toBe(
        unknownCategoryText([
          { id_categoria: 2, nombre: 'Falla de Internet' },
          { id_categoria: 3, nombre: 'Facturación y cobro' },
        ]),
      );
      expect(createSupport).not.toHaveBeenCalled();
    });

    it('cuts the description to what finet-clientes takes', async () => {
      await identify();
      complete.mockResolvedValueOnce(
        fileRequest({ ...report, descripcion: 'x'.repeat(6_000) }),
      );

      await web('...');
      const [request] = createSupport.mock.lastCall as [
        { description: string },
      ];
      expect(request.description).toHaveLength(5_000);
    });

    it('asks a customer without a portal session to log in', async () => {
      await identify();
      complete.mockResolvedValueOnce(listCategories);

      await expect(web('tengo una falla', null)).resolves.toEqual({
        content: SUPPORT_LOGIN_REQUIRED,
        handedOff: false,
      });
      expect(supportCategories).not.toHaveBeenCalled();
    });

    it('asks to log in again when finet-clientes rejects the session', async () => {
      await identify();
      createSupport.mockResolvedValue({ status: 'unauthorized' });
      complete.mockResolvedValueOnce(fileRequest(report));

      await expect(web('...')).resolves.toEqual({
        content: SUPPORT_SESSION_INVALID,
        handedOff: false,
      });
    });

    it('never lets the portal session reach the engine', async () => {
      await identify();
      complete.mockResolvedValueOnce(fileRequest(report));
      await web('...');
      await web('gracias');

      expect(JSON.stringify(complete.mock.calls)).not.toContain(TOKEN);
    });

    describe('exception 1: the support section does not answer', () => {
      it('hands off when the categories cannot be read', async () => {
        await identify();
        supportCategories.mockResolvedValue(null);
        complete.mockResolvedValueOnce(listCategories);

        await expect(web('tengo una falla')).resolves.toEqual({
          content: supportUnavailableText(WHATSAPP),
          handedOff: true,
        });
        expect(complete).toHaveBeenCalledTimes(1);
      });

      it('hands off when the request cannot be filed', async () => {
        await identify();
        createSupport.mockResolvedValue({ status: 'unavailable' });
        complete.mockResolvedValueOnce(fileRequest(report));

        await expect(web('...')).resolves.toEqual({
          content: supportUnavailableText(WHATSAPP),
          handedOff: true,
        });
        await expect(web('¿hola?')).resolves.toEqual({
          content: null,
          handedOff: true,
        });
      });
    });
  });

  describe('web widget', () => {
    const web = (content: string, sessionId = SESSION) =>
      service.handleWeb({ sessionId, content });

    it('asks a new visitor for their RUT', async () => {
      await expect(web('hola')).resolves.toEqual({
        content: RUT_REQUEST,
        handedOff: false,
      });
    });

    it('answers with the engine text once past the RUT step', async () => {
      await web('hola');
      await expect(web(RUT)).resolves.toEqual({
        content: 'respuesta',
        handedOff: false,
      });
    });

    it('keeps two sessions apart', async () => {
      await web('hola');
      await web(RUT);

      await expect(
        web('buenas', 'b1d7e0c4-2a9f-4e63-8f15-6c3a9d2e0f87'),
      ).resolves.toEqual({ content: RUT_REQUEST, handedOff: false });
    });

    it('does not share identity with Chatwoot conversations', async () => {
      await reply('hola');
      await reply(RUT);

      await expect(web('hola')).resolves.toEqual({
        content: RUT_REQUEST,
        handedOff: false,
      });
    });

    it('flags the handoff, then answers with no content', async () => {
      await web('hola');
      complete.mockResolvedValue(handoff);

      await expect(web('quiero hablar con una persona')).resolves.toEqual({
        content: handoffText(WHATSAPP),
        handedOff: true,
      });
      await expect(web('¿hola?')).resolves.toEqual({
        content: null,
        handedOff: true,
      });
    });
  });

  describe('Finet knowledge', () => {
    it('gives every answer the site facts and the current catalog', async () => {
      skipIdentification();
      await reply('¿qué planes tienen?');

      const { context } = lastCall();
      expect(context).toContain('https://finet.cl/cobertura');
      expect(context).toContain(
        '- Fibra 600 (internet, residencial): 600 Mbps,',
      );
      expect(context).toContain('19.990 al mes.');
      expect(context).toContain('no está identificado');
    });

    it('gives it to an identified customer too', async () => {
      await reply('hola');
      await reply(RUT);

      const { context } = lastCall();
      expect(context).toContain('Catálogo de planes vigente');
      expect(context).toContain('Juan Pérez');
    });

    it('tells the engine not to quote plans when there is no catalog', async () => {
      plans.mockResolvedValue(null);
      skipIdentification();
      await reply('¿cuánto cuesta el plan más rápido?');

      const { context } = lastCall();
      expect(context).toContain('Ahora no tienes el catálogo de planes');
      expect(context).not.toContain('Fibra 600');
    });

    it('does not need the catalog for the RUT request', async () => {
      await reply('hola');

      expect(plans).not.toHaveBeenCalled();
    });
  });
});
