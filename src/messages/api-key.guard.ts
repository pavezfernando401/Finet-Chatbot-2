import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { optionalSetting } from '../config/env.js';

const API_KEY_HEADER = 'x-api-key';

/**
 * Guards the direct way in. It writes into the same conversations the signed
 * Chatwoot webhook feeds and spends tokens on every call, so it cannot sit
 * open next to it.
 *
 * With `API_KEY` unset the route is closed rather than open — an endpoint
 * that authenticates only when someone remembers to configure it is the same
 * as no endpoint at all.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.apiKey = optionalSetting(config, 'API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey) {
      // Not 401: an unconfigured route should not announce that it exists.
      throw new NotFoundException();
    }

    const presented = context
      .switchToHttp()
      .getRequest<Request>()
      .header(API_KEY_HEADER);

    if (!presented) {
      throw new UnauthorizedException(`Missing ${API_KEY_HEADER}`);
    }

    // timingSafeEqual throws on a length mismatch, so rule that out first.
    const a = Buffer.from(presented);
    const b = Buffer.from(this.apiKey);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
