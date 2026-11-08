import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import {
  numberSetting,
  optionalSetting,
  requireSetting,
} from '../config/env.js';
import { OPENAI_CLIENT } from './openai.provider.js';

// Plain text because the site's widget shows the answer as-is: Markdown would
// reach the visitor as literal asterisks and pipes.
const DEFAULT_SYSTEM_PROMPT =
  'Eres el asistente de Finet. Responde en el idioma del usuario, ' +
  'de forma breve y concreta, en texto plano y sin Markdown. ' +
  'Si no sabes algo, dilo y ofrece derivar al cliente con una persona del equipo.';

/** What the engine answered: text, or a call to one of the tools it was offered. */
export type Completion =
  | { type: 'text'; content: string }
  | { type: 'tool'; name: string; arguments: Record<string, unknown> };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly temperature: number;

  constructor(
    @Inject(OPENAI_CLIENT) private readonly client: OpenAI,
    config: ConfigService,
  ) {
    this.model = requireSetting(config, 'OPENAI_MODEL');
    this.systemPrompt =
      optionalSetting(config, 'OPENAI_SYSTEM_PROMPT') ?? DEFAULT_SYSTEM_PROMPT;
    this.temperature = numberSetting(config, 'OPENAI_TEMPERATURE', 0.3);
  }

  /**
   * Asks the engine to continue the conversation.
   *
   * Uses chat completions rather than the responses API: it is the endpoint
   * every OpenAI-compatible server implements, which is what lets the base
   * URL be swapped freely.
   *
   * `tools` are offered to the engine; a call to one of them wins over any
   * text that came with it. A call to a tool that was not offered is ignored.
   * `signal` cuts the call short, retries included, when the caller's time
   * is up.
   */
  async complete(
    history: ChatCompletionMessageParam[],
    context?: string,
    tools: ChatCompletionFunctionTool[] = [],
    signal?: AbortSignal,
  ): Promise<Completion> {
    // `context` is what this turn needs on top of the prompt — who the
    // customer is, or that they are not identified. A second system message
    // rather than part of the prompt, so the prompt stays configurable.
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...(context ? [{ role: 'system' as const, content: context }] : []),
      ...history,
    ];

    let completion;
    try {
      completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          temperature: this.temperature,
          stream: false,
          ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
        },
        { signal },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Engine call failed: ${reason}`);
      throw new ServiceUnavailableException('The chat engine is unavailable');
    }

    const message = completion.choices[0]?.message;
    const offered = new Set(tools.map((tool) => tool.function.name));
    const call = message?.tool_calls?.find(
      (toolCall) =>
        toolCall.type === 'function' && offered.has(toolCall.function.name),
    );
    if (call?.type === 'function') {
      let arguments_: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(call.function.arguments || '{}') as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          arguments_ = parsed as Record<string, unknown>;
        }
      } catch {
        this.logger.warn(
          `Engine sent invalid arguments for ${call.function.name}`,
        );
      }
      return { type: 'tool', name: call.function.name, arguments: arguments_ };
    }

    const content = message?.content?.trim();
    if (!content) {
      this.logger.error('Engine returned an empty completion');
      throw new ServiceUnavailableException('The chat engine returned nothing');
    }

    return { type: 'text', content };
  }
}
