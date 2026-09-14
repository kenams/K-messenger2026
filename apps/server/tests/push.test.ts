import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, warnMock, SERVICE_ACCOUNT } = vi.hoisted(() => {
  // Fixed 2048-bit RSA test key (not used anywhere real). Must live inside
  // vi.hoisted(), not a plain top-level const — vi.mock factories below are
  // hoisted above this file's own statements and run before those would
  // otherwise have initialized.
  const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDB2ZpwUhXSKsEJ
G3+Rdub55XcSpCOfr2UmKF2bNOz4UtogW2wgeygzZKSTmS+/MhqA8V5Ud0INhq9H
20/7y3sYbNM1hrTroRTlxlJusq9lMvXrMqRUcsIIvrhSAdpcs6u9mZiH8Q+2X0OV
pe7qR05eYvaMMa+SRWXmZyUqGhUdoNgKl02jf1+hrLjvb1F6uurvl7pCFdcad18d
nSuQ73KdvECeVQAV1vWxtAE+3tyLAXynojo5WJSwjuUHzgVhbAbRwAHaYoJiZ3Ko
2xWpYPrBT9RkU2FDK0W0cKO6DVqU5TpZSmVCCyc3JlbQ3/t8ejKJIIiTAhYF1npl
p+pxrZSjAgMBAAECggEAQENBHYc40Kl3wOsqyTBftexKIxXi8WcV4yZykadj/5aH
1T45hDMPyqnMnVmlKH8VpjVeDiZS8WT66plb1J9KOXiqNA5qH8sQwHOUlDoMR0Iz
oDrzm0NH69o+BIG0wBKYFoy6siZKDS1bnFqb73KgGk44aZV3HMiA1XbQLTrkUSOT
eiQC3TpfUxIjXMfKea/xquSFpepYWLRYyAz0gwG0SgLu/x8uGYcfAnt8cPavzYBv
e5BtkBr+DaK6tOmTIjdMnzkxkNhebjHw7sCZbrFEGRZTpsFfCnvH3sSP7qbHHgnK
sw1lxPqfYBSTBjIoJ4YhEleqoBylA7BLEY8gbb4wcQKBgQDk2T+X+FDh9hiuwDoK
w1GR71UHcXI0IK+6cyqkEWGDiR3KeE2ZDEVf7/26iDH3QQD0/LrYHgPShyhmkM06
gFzUzt2opeizfgUNotGuHJwMDNwOubOufQICLr4yXlpflqoqBJVYBAW02NlJ2gfg
kYxKJOi36qd1cl+PHhZ2novu/wKBgQDY2VoyIYRD9ox+VOB+YtPNzxlhaX1ouy4F
YH/ohVljtpNHfJvzG1LARlxKGhCASC9GFTBIrCmhX6oH4j/tB3GTEw2DMxYPkyWs
ujrMEXZmgu9AIKGoH7QEf+sQcIX4vqNoCNKkJ+9ic+90w7EHOFdQAbPVL1mZwu9h
d0mZYQo+XQKBgGz7cKeEn7AcLID8FigOAAiJe2rCAesFLeqS8dmUVWX4pHFJfVrH
Vzpq5eAw/+qJ0FTbDnfhQ1y89OZzSujzPEI0CadI61qfRvTJdyV9hmrOrPVuRj1w
VsaHUBhYip0++OZtrFlwAO+w3TmoVVwCtFaS4SjE3N63iv5zC6uNsYItAoGBAKhE
EG8x/tZV7DLjXcf0m/HpsAIcv0mTZWSauuYNA44SUDp6gPCl1RKKBnchvogsezJg
orThkvQ7rU6sy3n7+q9ra2LRM18miWd8or9TFZL6KviR2Z8B6shLEnYROoQIOfgy
UHE84857s+XhK+80UtwsVgUo1tgvoVz6GUxBNpepAoGAHD8Spwt6xrvk2PM6I7l0
KHEthBqL2r0C53gwSsTcLhVAWsyVjfnKaEIbaRmbs7xUdrwPsQyP6csZAo3eq9FU
v/F30tAjsEQJuWcMX+08HJljjHLavDqnXzyJZ5zUp2FwQbj4lc4qvlfULLLIRYf3
iP16s0YMi6loUxnzYKV6wTQ=
-----END PRIVATE KEY-----`;
  return {
    queryMock: vi.fn(),
    warnMock: vi.fn(),
    SERVICE_ACCOUNT: JSON.stringify({
      project_id: 'kssenger-test',
      client_email: 'firebase-adminsdk-test@kssenger-test.iam.gserviceaccount.com',
      private_key: testPrivateKey,
    }),
  };
});

vi.mock('../src/db.js', () => ({ query: queryMock }));
vi.mock('../src/logger.js', () => ({ logger: { warn: warnMock } }));
vi.mock('../src/config.js', () => ({ config: { FCM_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT } }));

import { sendConversationPush, sendPushToUsers, resetPushClientForTests } from '../src/push.js';

const FCM_TOKEN = 'a'.repeat(150);

function mockFetchSequence(...responses: Array<Partial<Response> & { json?: () => Promise<unknown> }>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({ ok: true, ...response });
  }
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('push delivery', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    queryMock.mockReset();
    warnMock.mockReset();
    resetPushClientForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends a generic conversation notification without message contents', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ user_id: '00000000-0000-0000-0000-000000000002' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: '00000000-0000-0000-0000-000000000002', expo_push_token: FCM_TOKEN }] });

    const fetchMock = mockFetchSequence(
      { json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }) },
      { json: async () => ({ name: 'projects/kssenger-test/messages/1' }) },
    );

    await sendConversationPush(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000020',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sendCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(sendCall[0]).toContain('fcm.googleapis.com/v1/projects/kssenger-test/messages:send');
    const body = String(sendCall[1].body);
    expect(body).toContain('Nouveau message');
    expect(body).toContain('00000000-0000-0000-0000-000000000010');
    expect(body).toContain('00000000-0000-0000-0000-000000000020');
    expect(body).not.toContain('ciphertext');
    expect(body).not.toContain('plaintext');
  });

  it('rejects sensitive or unapproved push metadata before recipient lookup', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(sendPushToUsers(['00000000-0000-0000-0000-000000000002'], {
      title: 'K-ssenger',
      body: 'Nouveau message',
      data: {
        type: 'message',
        plaintext: 'contenu privé',
      },
    })).resolves.toBeUndefined();

    expect(queryMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledWith('push_delivery_failed', expect.objectContaining({
      error: 'PUSH_DATA_KEY_NOT_ALLOWED:plaintext',
    }));
  });

  it('rejects sensitive markers even when placed in otherwise generic text', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendPushToUsers(['00000000-0000-0000-0000-000000000002'], {
      title: 'K-ssenger',
      body: 'authorization token updated',
    });

    expect(queryMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledWith('push_delivery_failed', expect.objectContaining({
      error: 'PUSH_SENSITIVE_CONTENT_REJECTED',
    }));
  });

  it('disables a token rejected as UNREGISTERED', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ user_id: '00000000-0000-0000-0000-000000000002', expo_push_token: FCM_TOKEN }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { status: 'UNREGISTERED' } }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendPushToUsers(['00000000-0000-0000-0000-000000000002'], {
      title: 'K-ssenger',
      body: 'Test',
    });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(String(queryMock.mock.calls[1]?.[0])).toContain('enabled = false');
    expect(queryMock.mock.calls[1]?.[1]).toEqual([FCM_TOKEN]);
  });

  it('never throws into messaging when the provider fails', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ user_id: '00000000-0000-0000-0000-000000000002', expo_push_token: FCM_TOKEN }],
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(sendPushToUsers(['00000000-0000-0000-0000-000000000002'], {
      title: 'K-ssenger',
      body: 'Test',
    })).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalled();
  });
});
