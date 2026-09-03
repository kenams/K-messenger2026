import { describe, expect, it } from 'vitest';
import { messageSendSchema, presenceSchema, receiptSchema } from '../src/validation.js';

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
});
