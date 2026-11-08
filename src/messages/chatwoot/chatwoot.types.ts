/**
 * Chatwoot's own shapes, spelled as its docs spell them: snake_case, and only
 * the fields the docs list. Everything past the mapper uses our camelCase
 * types instead.
 *
 * https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
 */

/** Events a webhook can be subscribed to. */
export enum ChatwootEvent {
  MessageCreated = 'message_created',
  MessageUpdated = 'message_updated',
  ConversationCreated = 'conversation_created',
  ConversationUpdated = 'conversation_updated',
  ConversationStatusChanged = 'conversation_status_changed',
  ConversationTypingOn = 'conversation_typing_on',
  ConversationTypingOff = 'conversation_typing_off',
  WebwidgetTriggered = 'webwidget_triggered',
}

/** Direction of a message. `incoming` is the contact writing to us. */
export enum ChatwootMessageType {
  Incoming = 'incoming',
  Outgoing = 'outgoing',
  Template = 'template',
}

/** Renderer Chatwoot uses for the message body. */
export enum ChatwootContentType {
  Text = 'text',
  InputEmail = 'input_email',
  Cards = 'cards',
  InputSelect = 'input_select',
  Form = 'form',
  Article = 'article',
}

export enum ChatwootConversationStatus {
  Open = 'open',
  Resolved = 'resolved',
  Pending = 'pending',
  Snoozed = 'snoozed',
}

export interface ChatwootAccount {
  id: number;
  name?: string;
}

export interface ChatwootInbox {
  id: number;
  name?: string;
}

export interface ChatwootContact {
  id: number;
  name?: string;
  email?: string | null;
  phone_number?: string | null;
  identifier?: string | null;
  thumbnail?: string;
  custom_attributes?: Record<string, unknown>;
}

/** Author of a message: the contact on `incoming`, an agent on `outgoing`. */
export interface ChatwootSender extends ChatwootContact {
  type?: 'contact' | 'user';
  available_name?: string;
}

export interface ChatwootConversation {
  id?: number;
  /** Per-account number. This is what the REST API takes as `conversation_id`. */
  display_id: number;
  inbox_id?: number;
  status?: ChatwootConversationStatus;
  channel?: string;
  additional_attributes?: Record<string, unknown>;
  custom_attributes?: Record<string, unknown>;
}

/** Payload of `message_created` and `message_updated`. */
export interface ChatwootMessagePayload {
  event: ChatwootEvent.MessageCreated | ChatwootEvent.MessageUpdated;
  id: number;
  content: string | null;
  message_type: ChatwootMessageType;
  content_type?: ChatwootContentType;
  content_attributes?: Record<string, unknown>;
  /** Id on the upstream channel (WhatsApp, email...), empty on the widget. */
  source_id?: string | null;
  /** Private notes are agent-only and never reach the contact. */
  private?: boolean;
  created_at: string;
  sender?: ChatwootSender;
  contact?: ChatwootContact;
  conversation: ChatwootConversation;
  account: ChatwootAccount;
  inbox?: ChatwootInbox;
}

/** Any delivery. Narrow it by `event` before reading anything else. */
export interface ChatwootWebhookPayload {
  event: ChatwootEvent;
  [key: string]: unknown;
}

/**
 * Body of `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`.
 * Verbatim from the API reference, so it can be posted as-is.
 *
 * https://developers.chatwoot.com/api-reference/messages/create-new-message
 */
export interface ChatwootOutgoingMessage {
  content: string;
  message_type: ChatwootMessageType.Outgoing;
  private: boolean;
  content_type?: ChatwootContentType;
  content_attributes?: Record<string, unknown>;
}
