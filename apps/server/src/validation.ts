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

export const receiptSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  state: z.enum(['delivered', 'read']),
}).strict();

export const conversationJoinSchema = z.object({
  conversationId: z.string().uuid(),
}).strict();

export const contactTargetSchema = z.object({
  userId: z.string().uuid(),
}).strict();

export const contactRequestSchema = z.object({
  requestId: z.string().uuid(),
}).strict();

export const wizzSchema = z.object({
  recipientId: z.string().uuid(),
  variant: z.enum(['classic', 'love', 'fire', 'troll']).default('classic'),
}).strict();
