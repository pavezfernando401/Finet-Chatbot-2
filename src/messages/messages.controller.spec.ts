import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { ChatService } from '../chat/chat.service.js';
import { ConversationStore } from '../chat/conversation.store.js';
import { CustomersService } from '../customers/customers.service.js';
import { CatalogService } from '../knowledge/catalog.service.js';
import { ChatwootContentType } from './chatwoot/chatwoot.types.js';
import { RUT_REQUEST } from './identity.texts.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

describe('MessagesController', () => {
  let controller: MessagesController;
  let service: MessagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        MessagesService,
        ConversationStore,
        {
          provide: ChatService,
          useValue: {
            complete: vi
              .fn()
              .mockResolvedValue({ type: 'text', content: 'ok' }),
          },
        },
        { provide: CustomersService, useValue: { lookup: vi.fn() } },
        { provide: CatalogService, useValue: { plans: async () => null } },
        // The guard reads its key from config, the service the WhatsApp number.
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'REPLY_TIMEOUT_MS' ? undefined : 'test-api-key',
          },
        },
      ],
    }).compile();

    controller = module.get(MessagesController);
    service = module.get(MessagesService);
  });

  it('hands the message to the service and returns a Chatwoot-shaped reply', async () => {
    const handle = vi.spyOn(service, 'handleIncoming');

    const res = { status: vi.fn() };
    const reply = await controller.receive(
      { accountId: 1, conversationId: 12, content: 'hola' },
      res as unknown as Response,
    );

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'api',
        accountId: 1,
        conversationId: 12,
        content: 'hola',
        contentType: ChatwootContentType.Text,
      }),
    );
    // A new conversation, so the reply is the RUT request (CU-63).
    expect(res.status).not.toHaveBeenCalled();
    expect(reply?.message).toMatchObject({
      content: RUT_REQUEST,
      message_type: 'outgoing',
      content_type: 'text',
    });
  });

  it('answers 204 once the conversation was handed off', async () => {
    vi.spyOn(service, 'handleIncoming').mockResolvedValue(null);
    const res = { status: vi.fn() };

    const reply = await controller.receive(
      { accountId: 1, conversationId: 12, content: 'hola' },
      res as unknown as Response,
    );

    expect(reply).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
