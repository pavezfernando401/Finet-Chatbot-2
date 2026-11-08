import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { requireSetting } from '../../config/env.js';

const SIGNATURE_HEADER = 'x-chatwoot-signature';
const TIMESTAMP_HEADER = 'x-chatwoot-timestamp';

/** The docs suggest turning away anything older than five minutes. */
const MAX_AGE_SECONDS = 5 * 60;

/**
 * Checks the headers Chatwoot signs each delivery with:
 *
 *   X-Chatwoot-Signature = sha256=HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 *
 * The timestamp is part of the signed string, which is what stops a captured
 * delivery from being replayed later. It has to run on the bytes as they
 * arrived — re-serialising the parsed JSON changes them — so `main.ts` boots
 * the app with `rawBody: true`.
 *
 * https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
 */
@Injectable()
export class ChatwootSignatureGuard implements CanActivate {
  private readonly logger = new Logger(ChatwootSignatureGuard.name);
  private readonly secret: string;

  constructor(config: ConfigService) {
    // Read at startup so a blank secret — which would key the HMAC with '',
    // accepting anything — fails the boot instead of a request.
    this.secret = requireSetting(config, 'CHATWOOT_WEBHOOK_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();
    const received = request.header(SIGNATURE_HEADER);
    const timestamp = request.header(TIMESTAMP_HEADER);
    const rawBody = request.rawBody;

    if (!received || !timestamp || !rawBody) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt)) {
      throw new UnauthorizedException('Malformed webhook timestamp');
    }

    const age = Math.abs(Date.now() / 1000 - sentAt);
    if (age > MAX_AGE_SECONDS) {
      this.logger.warn(`Rejected a webhook delivery ${Math.round(age)}s old`);
      throw new UnauthorizedException('Stale webhook delivery');
    }

    const signed = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = `sha256=${createHmac('sha256', this.secret).update(signed).digest('hex')}`;

    // timingSafeEqual throws on a length mismatch, so rule that out first.
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Rejected a webhook delivery with a bad signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
