import { describe, expect, it } from 'vitest';
import { messageSendSchema } from '../src/validation.js';

describe('message envelope validation', () => {
  const base = {
    clientMessageId: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    senderDeviceId: '33333333-3333-4333-8333-333333333333',
    algorithm: 'e2ee-v1',
    ciphertext: 'BASE64_CIPHERTEXT_ONLY',
    createdAt: '2026-09-02T20:00:00.000Z',
  };

  it('accepts a ciphertext-only payload', () => {
    expect(messageSendSchema.parse(base).ciphertext).toBe(base.ciphertext);
  });

  it('rejects plaintext message fields', () => {
    expect(() => messageSendSchema.parse({ ...base, text: 'Salut Bob' })).toThrow();
    expect(() => messageSendSchema.parse({ ...base, body: 'Salut Bob' })).toThrow();
    expect(() => messageSendSchema.parse({ ...base, message: 'Salut Bob' })).toThrow();
  });
});
