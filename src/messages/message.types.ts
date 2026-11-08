import {
  ChatwootContentType,
  ChatwootOutgoingMessage,
} from './chatwoot/chatwoot.types.js';

/** Where a message reached us through. */
export enum MessageChannel {
  /** Chatwoot webhook. */
  Chatwoot = 'chatwoot',
  /** Our own `POST /messages`, for testing the bot without Chatwoot. */
  Api = 'api',
  /** The chat widget on the Finet site, relayed by the site's backend. */
  Web = 'web',
}

/**
 * A turn from the site's chat widget. The visitor is anonymous, so there is
 * no account or conversation to speak of: the widget's session is the
 * conversation.
 */
export interface WebMessage {
  sessionId: string;
  content: string;
  accessToken?: string;
}

/**
 * The bot's answer to a {@link WebMessage}. Once `handedOff` is true the
 * customer was sent to a person: the reply that says so carries the text,
 * and every message after it gets `content: null`.
 */
export interface WebReply {
  content: string | null;
  handedOff: boolean;
}

/**
 * A message once normalised. Keeps Chatwoot's data model — ids, conversation
 * identity, content type — in camelCase, because everything it feeds back
 * into is a Chatwoot API call.
 */
export interface IncomingMessage {
  channel: MessageChannel;
  accountId: number;
  /** Chatwoot's `display_id`: what its REST API takes as `conversation_id`. */
  conversationId: number;
  inboxId?: number;
  messageId?: number;
  content: string;
  contentType: ChatwootContentType;
  contentAttributes: Record<string, unknown>;
  sender: MessageSender;
  /** Id on the upstream channel, when the inbox has one. */
  sourceId?: string | null;
  createdAt: Date;
}

export interface MessageSender {
  id?: number;
  name?: string;
  email?: string | null;
  phoneNumber?: string | null;
}

/**
 * The bot's answer, already shaped as the body Chatwoot's create-message
 * endpoint expects, plus where to post it.
 */
export interface MessageReply {
  accountId: number;
  conversationId: number;
  message: ChatwootOutgoingMessage;
}
