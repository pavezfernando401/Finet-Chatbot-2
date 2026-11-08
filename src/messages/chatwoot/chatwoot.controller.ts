import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from '../messages.service.js';
import { ChatwootSignatureGuard } from './chatwoot-signature.guard.js';
import { toIncomingMessage } from './chatwoot.mapper.js';
import type { ChatwootWebhookPayload } from './chatwoot.types.js';

@Controller('webhooks/chatwoot')
@UseGuards(ChatwootSignatureGuard)
export class ChatwootWebhookController {
  private readonly logger = new Logger(ChatwootWebhookController.name);

  constructor(private readonly messages: MessagesService) {}

  /**
   * Every subscribed event lands here; the mapper decides which ones are a
   * message for the bot. The reply does not travel on this response —
   * Chatwoot ignores the body and wants a prompt 200. Answering the contact
   * means posting back to the create-message endpoint.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Body() payload: ChatwootWebhookPayload): Promise<void> {
    const message = toIncomingMessage(payload);
    if (!message) {
      this.logger.debug(`Ignored ${payload.event}`);
      return;
    }

    await this.messages.handleIncoming(message);
  }
}
