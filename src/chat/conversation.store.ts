import { Injectable } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Customer } from '../customers/customer.types.js';

/** Turns kept per conversation, the system prompt aside. */
const MAX_TURNS = 20;

/** Conversations kept at once. The least recently written is dropped first. */
const MAX_CONVERSATIONS = 1_000;

/**
 * Idle time after which a conversation starts over, RUT request included:
 * CU-63 asks again for the RUT after 48 hours without interaction.
 */
export const IDLE_LIMIT_MS = 48 * 60 * 60 * 1000;

/**
 * Who the bot is talking to (CU-63).
 *
 * - `new`: nothing said yet. The first message gets the RUT request.
 * - `awaiting_rut`: the RUT was asked for; the next message decides.
 * - `anonymous`: no RUT, or one that did not check out. General answers only.
 * - `identified`: the RUT matched a customer. Answers use their data. The
 *   RUT is kept to look their account up later (CU-64); it stays here and
 *   never goes into a turn.
 */
export type Identity =
  | { status: 'new' }
  | { status: 'awaiting_rut' }
  | { status: 'anonymous' }
  | { status: 'identified'; customer: Customer; rut: string };

export interface Conversation {
  turns: ChatCompletionMessageParam[];
  identity: Identity;
  /** Sent to a person: the bot no longer answers, nor keeps what it is sent. */
  handedOff: boolean;
}

interface Entry {
  conversation: Conversation;
  lastActivity: number;
}

/**
 * Conversations, in memory.
 *
 * Good enough to talk to the bot, and wrong for anything else: it dies with
 * the process and is not shared between instances. Replace it with a table,
 * or by reading the thread back from Chatwoot's conversation API.
 */
@Injectable()
export class ConversationStore {
  private readonly entries = new Map<string, Entry>();

  /**
   * One thread per conversation, per channel: account and conversation for
   * Chatwoot, the visitor's session for the web widget. The channel is part
   * of the key on purpose: the direct API, the widget and a signed Chatwoot
   * delivery must not be able to write into each other's history.
   */
  static key(channel: string, ...ids: (string | number)[]): string {
    return [channel, ...ids].join(':');
  }

  /** The channel a {@link key} was made for. */
  static channel(key: string): string {
    return key.split(':', 1)[0];
  }

  /** The conversation under `key`, or a fresh one if there is none or it went idle. */
  get(key: string): Conversation {
    const entry = this.entries.get(key);
    if (!entry || Date.now() - entry.lastActivity > IDLE_LIMIT_MS) {
      return { turns: [], identity: { status: 'new' }, handedOff: false };
    }
    return entry.conversation;
  }

  /** Stores `conversation` under `key` and counts it as activity. */
  save(key: string, conversation: Conversation): void {
    // Re-inserting moves the key to the end: a Map iterates in insertion
    // order, which makes the first key the least recently written.
    this.entries.delete(key);
    this.entries.set(key, {
      conversation: {
        ...conversation,
        turns: conversation.turns.slice(-MAX_TURNS),
      },
      lastActivity: Date.now(),
    });

    while (this.entries.size > MAX_CONVERSATIONS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  /** Conversations currently held. Exposed for tests and health reporting. */
  get size(): number {
    return this.entries.size;
  }
}
