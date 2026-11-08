import { MessageChannel } from '../message.types.js';
import { toIncomingMessage } from './chatwoot.mapper.js';
import {
  ChatwootContentType,
  ChatwootEvent,
  ChatwootMessageType,
  ChatwootWebhookPayload,
} from './chatwoot.types.js';

const delivery = (
  overrides: Record<string, unknown> = {},
): ChatwootWebhookPayload =>
  ({
    event: ChatwootEvent.MessageCreated,
    id: 42,
    content: 'hola',
    message_type: ChatwootMessageType.Incoming,
    content_type: ChatwootContentType.Text,
    content_attributes: {},
    source_id: 'wamid.abc',
    private: false,
    created_at: '2020-03-03 13:05:57 UTC',
    sender: {
      id: 7,
      name: 'Ada',
      email: 'ada@example.com',
      phone_number: null,
    },
    conversation: { display_id: 12, inbox_id: 3 },
    account: { id: 1, name: 'Finet' },
    inbox: { id: 3, name: 'Web' },
    ...overrides,
  }) as ChatwootWebhookPayload;

describe('toIncomingMessage', () => {
  it('maps an incoming message', () => {
    expect(toIncomingMessage(delivery())).toEqual({
      channel: MessageChannel.Chatwoot,
      accountId: 1,
      conversationId: 12,
      inboxId: 3,
      messageId: 42,
      content: 'hola',
      contentType: ChatwootContentType.Text,
      contentAttributes: {},
      sender: {
        id: 7,
        name: 'Ada',
        email: 'ada@example.com',
        phoneNumber: null,
      },
      sourceId: 'wamid.abc',
      createdAt: new Date('2020-03-03 13:05:57 UTC'),
    });
  });

  it('accepts the quoted ids the docs show', () => {
    const message = toIncomingMessage(
      delivery({
        id: '42',
        account: { id: '1' },
        conversation: { display_id: '12' },
      }),
    );

    expect(message).toMatchObject({
      accountId: 1,
      conversationId: 12,
      messageId: 42,
    });
  });

  it('drops the bot own replies, which arrive as deliveries too', () => {
    expect(
      toIncomingMessage(
        delivery({ message_type: ChatwootMessageType.Outgoing }),
      ),
    ).toBeNull();
    expect(
      toIncomingMessage(
        delivery({ message_type: ChatwootMessageType.Template }),
      ),
    ).toBeNull();
  });

  it('drops private notes between agents', () => {
    expect(toIncomingMessage(delivery({ private: true }))).toBeNull();
  });

  it('drops events other than message_created', () => {
    for (const event of [
      ChatwootEvent.MessageUpdated,
      ChatwootEvent.ConversationCreated,
      ChatwootEvent.ConversationTypingOn,
      ChatwootEvent.WebwidgetTriggered,
    ]) {
      expect(toIncomingMessage(delivery({ event }))).toBeNull();
    }
  });

  it('drops a body with nothing in it', () => {
    expect(toIncomingMessage(delivery({ content: null }))).toBeNull();
    expect(toIncomingMessage(delivery({ content: '   ' }))).toBeNull();
  });

  it('drops a delivery with no account or conversation', () => {
    expect(toIncomingMessage(delivery({ account: {} }))).toBeNull();
    expect(toIncomingMessage(delivery({ conversation: {} }))).toBeNull();
  });

  it('refuses an id that is not one, rather than coercing it to 0', () => {
    for (const id of [null, '', '  ', false, 0, -1, 1.5, {}]) {
      expect(toIncomingMessage(delivery({ account: { id } }))).toBeNull();
      expect(
        toIncomingMessage(delivery({ conversation: { display_id: id } })),
      ).toBeNull();
    }
  });

  it('falls back to contact when there is no sender', () => {
    const message = toIncomingMessage(
      delivery({ sender: undefined, contact: { id: 9, name: 'Grace' } }),
    );

    expect(message?.sender).toMatchObject({ id: 9, name: 'Grace' });
  });
});
