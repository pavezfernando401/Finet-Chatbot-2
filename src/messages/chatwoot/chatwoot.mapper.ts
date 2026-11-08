import { IncomingMessage, MessageChannel } from '../message.types.js';
import {
  ChatwootContentType,
  ChatwootEvent,
  ChatwootMessagePayload,
  ChatwootMessageType,
  ChatwootWebhookPayload,
} from './chatwoot.types.js';

/**
 * The docs show ids quoted (`"id": "1"`) while the REST API returns them as
 * numbers, so accept either and settle on a number.
 *
 * Anything else is rejected rather than coerced: `Number(null)`, `Number('')`
 * and `Number(false)` are all `0`, and a `0` slipping through would file
 * every malformed delivery under one shared history.
 */
function toId(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Turns a delivery into one of our messages, or `null` when there is nothing
 * for the bot to answer. Dropped on purpose:
 *
 * - every event other than `message_created`;
 * - `outgoing` and `template` messages — the bot's own replies come back as
 *   deliveries too, and answering them loops forever;
 * - private notes, which agents write to each other;
 * - empty bodies, such as an attachment with no caption.
 */
export function toIncomingMessage(
  payload: ChatwootWebhookPayload,
): IncomingMessage | null {
  if (payload.event !== ChatwootEvent.MessageCreated) return null;

  const message = payload as unknown as ChatwootMessagePayload;
  if (message.message_type !== ChatwootMessageType.Incoming) return null;
  if (message.private) return null;

  const content = message.content?.trim();
  if (!content) return null;

  const accountId = toId(message.account?.id);
  const conversationId = toId(message.conversation?.display_id);
  if (accountId === undefined || conversationId === undefined) return null;

  const sender = message.sender ?? message.contact;

  return {
    channel: MessageChannel.Chatwoot,
    accountId,
    conversationId,
    inboxId: toId(message.inbox?.id) ?? toId(message.conversation?.inbox_id),
    messageId: toId(message.id),
    content,
    contentType: message.content_type ?? ChatwootContentType.Text,
    contentAttributes: message.content_attributes ?? {},
    sender: {
      id: toId(sender?.id),
      name: sender?.name,
      email: sender?.email,
      phoneNumber: sender?.phone_number,
    },
    sourceId: message.source_id,
    createdAt: message.created_at ? new Date(message.created_at) : new Date(),
  };
}
