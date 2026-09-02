import { z } from 'zod';

export const messageSendSchema = z.object({
  clientMessageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderDeviceId: z.string().uuid(),
  algorithm: z.string().min(1).max(64),
  ciphertext: z.string().min(1).max(2_000_000),
  nonce: z.string().max(512).optional(),
  aad: z.string().max(4096).optional(),
  createdAt: z.string().datetime(),
}).strict();

export const presenceSchema = z.object({
  status: z.enum(['online', 'busy', 'away', 'invisible', 'offline'])
}).strict();
