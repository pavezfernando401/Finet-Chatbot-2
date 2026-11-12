import { describe, expect, it, vi } from 'vitest';
import type { MessagesService } from '../messages.service.js';
import { WebMessagesController } from './web-messages.controller.js';

describe('WebMessagesController', () => {
  // Without this the bot answered Cable Mágico's site as Finet: the DTO
  // accepted companyId, but the controller dropped it on the way.
  it('passes the site company on to the service', async () => {
    const handleWeb = vi
      .fn()
      .mockResolvedValue({ content: 'ok', handedOff: false });
    const controller = new WebMessagesController({
      handleWeb,
    } as unknown as MessagesService);

    await controller.receive({
      sessionId: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
      content: 'hola',
      companyId: 2,
    });

    expect(handleWeb).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hola', companyId: 2 }),
    );
  });
});
