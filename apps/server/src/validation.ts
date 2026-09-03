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

export const messageHistorySchema = z.object({
  conversationId: z.string().uuid(),
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(50),
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

export const groupCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string().uuid()).min(1).max(49)
    .refine((ids) => new Set(ids).size === ids.length, 'DUPLICATE_GROUP_MEMBER'),
}).strict();

export const groupMemberSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict();

export const groupRoleSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['member', 'admin', 'owner']),
}).strict();

export const groupConversationSchema = z.object({
  conversationId: z.string().uuid(),
}).strict();

export const contactTargetSchema = z.object({
  userId: z.string().uuid(),
}).strict();

export const contactRequestSchema = z.object({
  requestId: z.string().uuid(),
}).strict();

export const contactFavoriteSchema = z.object({
  userId: z.string().uuid(),
  favorite: z.boolean(),
}).strict();

export const contactSearchSchema = z.object({
  query: z.string().trim().min(2).max(32),
}).strict();

export const wizzSchema = z.object({
  recipientId: z.string().uuid(),
  variant: z.enum(['classic', 'love', 'fire', 'troll']).default('classic'),
}).strict();
