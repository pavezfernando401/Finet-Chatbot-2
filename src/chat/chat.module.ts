import { Module } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ConversationStore } from './conversation.store.js';
import { openAiProvider } from './openai.provider.js';

@Module({
  providers: [openAiProvider, ChatService, ConversationStore],
  exports: [ChatService, ConversationStore],
})
export class ChatModule {}
