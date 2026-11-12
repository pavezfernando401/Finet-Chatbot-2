import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../api-key.guard.js';
import { CreateWebMessageDto } from '../dto/create-web-message.dto.js';
import { WebReply } from '../message.types.js';
import { MessagesService } from '../messages.service.js';

/**
 * The site's chat widget. The browser never calls this: the site's backend
 * does, holding the API key, so the key and the engine stay off the public
 * internet and the rate limit lives next to the visitors it limits.
 */
@Controller('web/messages')
@UseGuards(ApiKeyGuard)
export class WebMessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** One visitor turn. Answers on the response, unlike the Chatwoot webhook. */
  @Post()
  async receive(@Body() dto: CreateWebMessageDto): Promise<WebReply> {
    return this.messages.handleWeb({
      sessionId: dto.sessionId,
      content: dto.content,
      accessToken: dto.accessToken,
      clientIp: dto.clientIp,
      companyId: dto.companyId,
    });
  }
}
