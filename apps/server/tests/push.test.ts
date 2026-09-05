import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, warnMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('../src/db.js', () => ({ query: queryMock }));
vi.mock('../src/logger.js', () => ({ logger: { warn: warnMock } }));

import { sendConversationPush, sendPushToUsers } from '../src/push.js';

describe('push delivery', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    queryMock.mockReset();
    warnMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends a generic conversation notification without message contents', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ user_id: '00000000-0000-0000-0000-000000000002' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: '00000000-0000-0000-0000-000000000002', expo_push_token: 'ExpoPushToken[test_token]' }] });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await sendConversationPush(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000020',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = String(init.body);
    expect(body).toContain('Nouveau message');
    expect(body).toContain('00000000-0000-0000-0000-000000000010');
    expect(body).toContain('00000000-0000-0000-0000-000000000020');
    expect(body).not.toContain('ciphertext');
    expect(body).not.toContain('plaintext');
  });

  it('disables a token rejected as DeviceNotRegistered', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ user_id: '00000000-0000-0000-0000-000000000002', expo_push_token: 'ExponentPushToken[dead_token]' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    }) as unknown as typeof fetch;

    await sendPushToUsers(['00000000-0000-0000-0000-000000000002'], {
      title: 'K-ssenger',
      body: 'Test',
    });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(String(queryMock.mock.calls[1]?.[0])).toContain('enabled = false');
    expect(queryMock.mock.calls[1]?.[1]).toEqual(['ExponentPushToken[dead_token]']);
  });

  it('never throws into messaging when the provider fails', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ user_id: '00000000-0000-0000-0000-000000000002', expo_push_token: 'ExpoPushToken[test_token]' }],
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(sendPushToUsers(['00000000-0000-0000-0000-000000000002'], {
      title: 'K-ssenger',
      body: 'Test',
    })).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalled();
  });
});
