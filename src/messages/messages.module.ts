import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ChatwootSignatureGuard } from './chatwoot/chatwoot-signature.guard.js';
import { ChatwootWebhookController } from './chatwoot/chatwoot.controller.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { WebMessagesController } from './web/web-messages.controller.js';

@Module({
  imports: [ChatModule, CustomersModule, KnowledgeModule],
  controllers: [
    MessagesController,
    WebMessagesController,
    ChatwootWebhookController,
  ],
  // Both guards read their settings in the constructor; listing them here
  // means a bad one is caught while the app starts, not on a live request.
  providers: [MessagesService, ApiKeyGuard, ChatwootSignatureGuard],
  exports: [MessagesService],
})
export class MessagesModule {}
