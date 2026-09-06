import { describe, expect, it, vi } from 'vitest';
import { registerGroupBanListHandler } from '../src/groupModerationSocket.js';

type Handler = (raw: unknown, ack?: (response: unknown) => void) => Promise<void>;

type CaptureOptions = {
  consumeRateLimit: () => boolean;
  listBans?: (userId: string, conversationId: string) => Promise<unknown>;
};

function captureHandler({ consumeRateLimit, listBans }: CaptureOptions) {
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
    listBans,
  });

  if (!handler) throw new Error('group:bans-list handler was not registered');
  return handler;
}

describe('group:bans-list socket contract', () => {
  it('fails closed before parsing when rate limited', async () => {
    const handler = captureHandler({ consumeRateLimit: () => false });
    const ack = vi.fn();

    await handler({ conversationId: '550e8400-e29b-41d4-a716-446655440041' }, ack);

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'RATE_LIMITED' });
  });

  it('rejects forged actor fields without reaching the store', async () => {
    const listBans = vi.fn(async () => []);
    const handler = captureHandler({ consumeRateLimit: () => true, listBans });
    const ack = vi.fn();

    await handler(
      {
        conversationId: '550e8400-e29b-41d4-a716-446655440041',
        actorId: '550e8400-e29b-41d4-a716-446655440042',
      },
      ack,
    );

    expect(listBans).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'REJECTED' });
  });

  it('rejects malformed conversation ids', async () => {
    const listBans = vi.fn(async () => []);
    const handler = captureHandler({ consumeRateLimit: () => true, listBans });
    const ack = vi.fn();

    await handler({ conversationId: 'not-a-uuid' }, ack);

    expect(listBans).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'REJECTED' });
  });

  it('passes only authenticated socket identity and validated conversation id to the store', async () => {
    const bans = [{ userId: '550e8400-e29b-41d4-a716-446655440043', bannedAt: '2026-09-04T18:00:00.000Z' }];
    const listBans = vi.fn(async () => bans);
    const handler = captureHandler({ consumeRateLimit: () => true, listBans });
    const ack = vi.fn();

    await handler({ conversationId: '550e8400-e29b-41d4-a716-446655440041' }, ack);

    expect(listBans).toHaveBeenCalledTimes(1);
    expect(listBans).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440040',
      '550e8400-e29b-41d4-a716-446655440041',
    );
    expect(ack).toHaveBeenCalledWith({ ok: true, bans });
  });
});
