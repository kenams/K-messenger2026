import { describe, expect, it, vi } from 'vitest';
import { registerGroupBanListHandler } from '../src/groupModerationSocket.js';

type Handler = (raw: unknown, ack?: (response: unknown) => void) => Promise<void>;

function captureHandler(consumeRateLimit: () => boolean) {
  let handler: Handler | undefined;
  const socket = {
    on: (event: string, callback: Handler) => {
      expect(event).toBe('group:bans-list');
      handler = callback;
    },
  };

  registerGroupBanListHandler({
    socket: socket as never,
    userId: '550e8400-e29b-41d4-a716-446655440040',
    consumeRateLimit,
  });

  if (!handler) throw new Error('group:bans-list handler was not registered');
  return handler;
}

describe('group:bans-list socket contract', () => {
  it('fails closed before parsing when rate limited', async () => {
    const handler = captureHandler(() => false);
    const ack = vi.fn();

    await handler({ conversationId: '550e8400-e29b-41d4-a716-446655440041' }, ack);

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'RATE_LIMITED' });
  });

  it('rejects forged actor fields without reaching the store', async () => {
    const handler = captureHandler(() => true);
    const ack = vi.fn();

    await handler(
      {
        conversationId: '550e8400-e29b-41d4-a716-446655440041',
        actorId: '550e8400-e29b-41d4-a716-446655440042',
      },
      ack,
    );

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'REJECTED' });
  });

  it('rejects malformed conversation ids', async () => {
    const handler = captureHandler(() => true);
    const ack = vi.fn();

    await handler({ conversationId: 'not-a-uuid' }, ack);

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'REJECTED' });
  });
});
