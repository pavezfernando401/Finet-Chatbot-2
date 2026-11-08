import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard } from './api-key.guard.js';
import { ChatwootContentType } from './chatwoot/chatwoot.types.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { MessageChannel, MessageReply } from './message.types.js';
import { MessagesService } from './messages.service.js';

@Controller('messages')
@UseGuards(ApiKeyGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /**
   * Feeds the bot directly, without a Chatwoot delivery. Returns the reply,
   * or 204 once the conversation was handed off and the bot stays quiet.
   */
  @Post()
  async receive(
    @Body() dto: CreateMessageDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageReply | undefined> {
    const reply = await this.messages.handleIncoming({
      channel: MessageChannel.Api,
      accountId: dto.accountId,
      conversationId: dto.conversationId,
      content: dto.content,
      contentType: dto.contentType ?? ChatwootContentType.Text,
      contentAttributes: {},
      sender: { id: dto.senderId },
      createdAt: new Date(),
    });
    if (reply) return reply;

    res.status(HttpStatus.NO_CONTENT);
    return undefined;
  }
}
