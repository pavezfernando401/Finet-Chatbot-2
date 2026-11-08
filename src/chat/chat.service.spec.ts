import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { ChatService } from './chat.service.js';
import { OPENAI_CLIENT } from './openai.provider.js';

const tool: ChatCompletionFunctionTool = {
  type: 'function',
  function: { name: 'derivar', parameters: { type: 'object', properties: {} } },
};

const toolCall = (name: string) => ({
  id: 'call_1',
  type: 'function',
  function: { name, arguments: '{}' },
});

const settings: Record<string, string> = {
  OPENAI_MODEL: 'llama3.1',
  OPENAI_SYSTEM_PROMPT: 'Eres un bot de prueba.',
  OPENAI_TEMPERATURE: '0.1',
};

describe('ChatService', () => {
  let service: ChatService;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    create = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: OPENAI_CLIENT,
          useValue: { chat: { completions: { create } } },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => settings[key],
            getOrThrow: (key: string) => settings[key],
          },
        },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  it('puts the system prompt in front of the history', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: '  Hola, ¿en qué te ayudo?  ' } }],
    });

    const answer = await service.complete([{ role: 'user', content: 'hola' }]);

    expect(answer).toEqual({
      type: 'text',
      content: 'Hola, ¿en qué te ayudo?',
    });
    expect(create).toHaveBeenCalledWith(
      {
        model: 'llama3.1',
        messages: [
          { role: 'system', content: 'Eres un bot de prueba.' },
          { role: 'user', content: 'hola' },
        ],
        temperature: 0.1,
        stream: false,
      },
      { signal: undefined },
    );
  });

  it('puts the turn context right after the system prompt', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });

    await service.complete(
      [{ role: 'user', content: 'hola' }],
      'El cliente está identificado.',
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'Eres un bot de prueba.' },
          { role: 'system', content: 'El cliente está identificado.' },
          { role: 'user', content: 'hola' },
        ],
      }),
      expect.anything(),
    );
  });

  it('offers the tools it is given', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });

    await service.complete([{ role: 'user', content: 'hola' }], undefined, [
      tool,
    ]);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tools: [tool], tool_choice: 'auto' }),
      expect.anything(),
    );
  });

  it('returns a call to an offered tool, over any text with it', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: { content: 'Te derivo.', tool_calls: [toolCall('derivar')] },
        },
      ],
    });

    await expect(service.complete([], undefined, [tool])).resolves.toEqual({
      type: 'tool',
      name: 'derivar',
      arguments: {},
    });
  });

  it('ignores a call to a tool it did not offer', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: { content: 'Hola.', tool_calls: [toolCall('borrar_todo')] },
        },
      ],
    });

    await expect(service.complete([], undefined, [tool])).resolves.toEqual({
      type: 'text',
      content: 'Hola.',
    });
  });

  it("hands the caller's signal to the engine call", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    const { signal } = new AbortController();

    await service.complete([], undefined, [], signal);

    expect(create).toHaveBeenCalledWith(expect.anything(), { signal });
  });

  it('turns an engine failure into a 503', async () => {
    create.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.complete([])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses an empty completion', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

    await expect(service.complete([])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
