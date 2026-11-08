import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { numberSetting, requireSetting } from '../config/env.js';

export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

/**
 * The OpenAI SDK talks to anything that speaks the same wire format, so
 * `OPENAI_BASE_URL` decides which one: a local Ollama, Groq, OpenRouter, or
 * OpenAI itself later on. Nothing below this file knows the difference.
 *
 * Built at boot, so a bad setting stops the start rather than the first
 * message.
 */
export const openAiProvider: Provider = {
  provide: OPENAI_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): OpenAI => {
    const baseURL = requireSetting(config, 'OPENAI_BASE_URL');

    new Logger('OpenAI').log(`Engine at ${baseURL}`);

    return new OpenAI({
      baseURL,
      // Some compatible servers ignore it, but the SDK insists on a value.
      apiKey: requireSetting(config, 'OPENAI_API_KEY'),
      timeout: numberSetting(config, 'OPENAI_TIMEOUT_MS', 30_000),
      maxRetries: numberSetting(config, 'OPENAI_MAX_RETRIES', 2),
    });
  },
};
