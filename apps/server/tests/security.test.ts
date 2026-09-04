import { describe, expect, it } from 'vitest';
import {
  groupBanSchema,
  groupMuteSchema,
  messageSendSchema,
  presenceSchema,
  receiptSchema,
} from '../src/validation.js';

describe('network contracts', () => {
  it('rejects plaintext message fields', () => {
    const result = messageSendSchema.safeParse({
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      senderDeviceId: '550e8400-e29b-41d4-a716-446655440002',
      algorithm: 'test',
      ciphertext: 'opaque',
      createdAt: new Date().toISOString(),
      text: 'Salut Bob',
    });
    expect(result.success).toBe(false);
  });

  it('accepts supported presence states only', () => {
    expect(presenceSchema.safeParse({ status: 'online' }).success).toBe(true);
    expect(presenceSchema.safeParse({ status: 'hacked' }).success).toBe(false);
  });

  it('accepts only delivered/read message receipts', () => {
    const base = {
      messageId: '550e8400-e29b-41d4-a716-446655440010',
      conversationId: '550e8400-e29b-41d4-a716-446655440011',
    };
    expect(receiptSchema.safeParse({ ...base, state: 'delivered' }).success).toBe(true);
    expect(receiptSchema.safeParse({ ...base, state: 'read' }).success).toBe(true);
    expect(receiptSchema.safeParse({ ...base, state: 'seen-by-server' }).success).toBe(false);
  });

  it('strictly validates group mute payloads', () => {
    const base = {
      conversationId: '550e8400-e29b-41d4-a716-446655440020',
      userId: '550e8400-e29b-41d4-a716-446655440021',
    };
    expect(groupMuteSchema.safeParse({ ...base, mutedUntil: new Date(Date.now() + 60_000).toISOString() }).success).toBe(true);
    expect(groupMuteSchema.safeParse({ ...base, mutedUntil: null }).success).toBe(true);
    expect(groupMuteSchema.safeParse({ ...base, mutedUntil: 'forever' }).success).toBe(false);
    expect(groupMuteSchema.safeParse({ ...base, mutedUntil: null, role: 'owner' }).success).toBe(false);
  });

  it('bounds group ban reasons and rejects forged moderation fields', () => {
    const base = {
      conversationId: '550e8400-e29b-41d4-a716-446655440030',
      userId: '550e8400-e29b-41d4-a716-446655440031',
    };
    expect(groupBanSchema.safeParse({ ...base, reason: 'Spam répété' }).success).toBe(true);
    expect(groupBanSchema.safeParse({ ...base, reason: null }).success).toBe(true);
    expect(groupBanSchema.safeParse({ ...base, reason: 'x'.repeat(241) }).success).toBe(false);
    expect(groupBanSchema.safeParse({ ...base, reason: 'Spam', bannedBy: 'attacker' }).success).toBe(false);
  });
});
