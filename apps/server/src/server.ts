import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { authenticateSocket } from './auth.js';
import {
  requireActiveDevice,
  requireConversationMember,
  requireConversationNotBlocked,
} from './authorization.js';
import {
  contactFavoriteSchema,
  contactRequestSchema,
  contactSearchSchema,
  contactTargetSchema,
  conversationJoinSchema,
  groupCreateSchema,
  messageHistorySchema,
  messageSendSchema,
  presenceSchema,
  receiptSchema,
  wizzSchema,
} from './validation.js';
import { createOrGetDirectConversation } from './directConversationStore.js';
import { createGroup } from './groupStore.js';
import { listEncryptedMessages, persistEncryptedMessage } from './messageStore.js';
import { markMessageReceipt } from './receiptStore.js';
import {
  joinLimiter,
  messageLimiter,
  presenceLimiter,
  socialLimiter,
  wizzLimiter,
} from './rateLimit.js';
import { logger } from './logger.js';
import { PresenceRuntime } from './presenceRuntime.js';
import { listConversations } from './conversationStore.js';
import {
  acceptContact,
  blockUser,
  cancelContactRequest,
  canWizz,
  declineContact,
  getContactAudience,
  listContactRequests,
  listContacts,
  removeContact,
  requestContact,
  searchProfiles,
  setFavorite,
  setPresence,
} from './social.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '64kb' }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'k-ssenger-server' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.CORS_ORIGIN, credentials: true },
  maxHttpBufferSize: 2_100_000,
  transports: ['websocket', 'polling'],
});

const presenceRuntime = new PresenceRuntime();

async function broadcastPresence(userId: string, status: 'online' | 'busy' | 'away' | 'invisible' | 'offline') {
  const { visibleStatus, becameVisible } = presenceRuntime.noteStatus(userId, status);
  const audience = await getContactAudience(userId);
  for (const contactId of audience) {
    io.to(`user:${contactId}`).emit('presence:changed', { userId, status: visibleStatus });
  }

  if (becameVisible && presenceRuntime.shouldEmitLoginEvent(userId)) {
    for (const contactId of audience) {
      io.to(`user:${contactId}`).emit('presence:login', { userId, status: visibleStatus });
    }
  }

  io.to(`user:${userId}`).emit('presence:self', { userId, status });
}

async function handleKPulseSend(
  userId: string,
  raw: unknown,
  ack: ((response: unknown) => void) | undefined,
  emitLegacyNudge: boolean,
) {
  try {
    const { recipientId, variant } = wizzSchema.parse(raw);
    if (!wizzLimiter.consume(`${userId}:${recipientId}`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
    await canWizz(userId, recipientId);

    const payload = { senderId: userId, variant, sentAt: new Date().toISOString() };
    io.to(`user:${recipientId}`).emit('kpulse:receive', payload);
    if (emitLegacyNudge) io.to(`user:${recipientId}`).emit('nudge:receive', payload);
    ack?.({ ok: true });
  } catch {
    ack?.({ ok: false, error: 'REJECTED' });
  }
}

io.use(async (socket, next) => {
  try {
    socket.data.userId = await authenticateSocket(socket);
    next();
  } catch {
    logger.warn('socket_auth_rejected', { socketId: socket.id });
    next(new Error('UNAUTHENTICATED'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);
  const { firstSocket } = presenceRuntime.connect(userId, socket.id);
  logger.info('socket_connected', { userId, socketId: socket.id, firstSocket });

  socket.on('conversation:direct', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:conversation:direct`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { userId: contactId } = contactTargetSchema.parse(raw);
      const direct = await createOrGetDirectConversation(userId, contactId);
      socket.join(`conversation:${direct.conversationId}`);
      io.to(`user:${contactId}`).emit('conversation:direct-ready', {
        conversationId: direct.conversationId,
        peerId: userId,
      });
      ack?.({ ok: true, ...direct });
    } catch (error) {
      logger.warn('direct_conversation_rejected', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('conversation:join', async (raw, ack) => {
    try {
      if (!joinLimiter.consume(userId)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { conversationId } = conversationJoinSchema.parse(raw);
      await requireConversationMember(userId, conversationId);
      await requireConversationNotBlocked(userId, conversationId);
      socket.join(`conversation:${conversationId}`);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'FORBIDDEN' });
    }
  });

  socket.on('conversation:history', async (raw, ack) => {
    try {
      if (!joinLimiter.consume(`${userId}:history`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const request = messageHistorySchema.parse(raw);
      await requireConversationMember(userId, request.conversationId);
      await requireConversationNotBlocked(userId, request.conversationId);
      const history = await listEncryptedMessages(request);
      ack?.({ ok: true, ...history });
    } catch (error) {
      logger.warn('message_history_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('conversations:list', async (_raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:conversations`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      ack?.({ ok: true, conversations: await listConversations(userId) });
    } catch (error) {
      logger.warn('conversations_list_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('group:create', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:group:create`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const request = groupCreateSchema.parse(raw);
      const group = await createGroup(userId, request.title, request.memberIds);
      socket.join(`conversation:${group.conversationId}`);
      for (const memberId of [userId, ...group.memberIds]) {
        io.to(`user:${memberId}`).emit('group:created', {
          conversationId: group.conversationId,
          title: group.title,
          ownerId: userId,
          memberIds: group.memberIds,
        });
      }
      ack?.({ ok: true, conversationId: group.conversationId });
    } catch (error) {
      logger.warn('group_create_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('message:send', async (raw, ack) => {
    try {
      if (!messageLimiter.consume(userId)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const envelope = messageSendSchema.parse(raw);
      await requireConversationMember(userId, envelope.conversationId);
      await requireActiveDevice(userId, envelope.senderDeviceId);
      await requireConversationNotBlocked(userId, envelope.conversationId);

      const stored = await persistEncryptedMessage(userId, envelope);
      if (!stored.duplicate) {
        io.to(`conversation:${envelope.conversationId}`).emit('message:new', {
          ...envelope,
          id: stored.id,
          senderUserId: userId,
          createdAt: stored.createdAt,
        });
      }

      ack?.({ ok: true, id: stored.id, duplicate: stored.duplicate, clientMessageId: envelope.clientMessageId });
    } catch (error) {
      logger.warn('message_send_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('message:receipt', async (raw, ack) => {
    try {
      if (!messageLimiter.consume(`${userId}:receipt`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const receipt = receiptSchema.parse(raw);
      await requireConversationMember(userId, receipt.conversationId);
      await requireConversationNotBlocked(userId, receipt.conversationId);
      const stored = await markMessageReceipt(userId, receipt);
      io.to(`conversation:${receipt.conversationId}`).emit('message:receipt', {
        messageId: stored.message_id,
        userId: stored.user_id,
        state: stored.read_at ? 'read' : 'delivered',
        deliveredAt: stored.delivered_at,
        readAt: stored.read_at,
      });
      ack?.({ ok: true, receipt: stored });
    } catch (error) {
      logger.warn('message_receipt_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contacts:list', async (_raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:list`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      ack?.({ ok: true, contacts: await listContacts(userId) });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contacts:requests', async (_raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:requests`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      ack?.({ ok: true, requests: await listContactRequests(userId) });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contacts:search', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:search`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { query } = contactSearchSchema.parse(raw);
      ack?.({ ok: true, profiles: await searchProfiles(userId, query) });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contact:request', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:request`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { userId: recipientId } = contactTargetSchema.parse(raw);
      const request = await requestContact(userId, recipientId);
      io.to(`user:${recipientId}`).emit('contact:request', { requestId: request.id, senderId: userId });
      ack?.({ ok: true, requestId: request.id });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contact:accept', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:accept`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { requestId } = contactRequestSchema.parse(raw);
      const request = await acceptContact(userId, requestId);
      io.to(`user:${request.sender_id}`).emit('contact:accepted', { userId });
      io.to(`user:${userId}`).emit('contact:accepted', { userId: request.sender_id });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contact:decline', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:decline`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { requestId } = contactRequestSchema.parse(raw);
      const request = await declineContact(userId, requestId);
      io.to(`user:${request.sender_id}`).emit('contact:declined', { requestId });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contact:cancel', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:cancel`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { requestId } = contactRequestSchema.parse(raw);
      const request = await cancelContactRequest(userId, requestId);
      io.to(`user:${request.recipient_id}`).emit('contact:cancelled', { requestId });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contact:remove', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:remove`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { userId: contactId } = contactTargetSchema.parse(raw);
      await removeContact(userId, contactId);
      io.to(`user:${contactId}`).emit('contact:removed', { userId });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contact:favorite', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:favorite`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { userId: contactId, favorite } = contactFavoriteSchema.parse(raw);
      const contact = await setFavorite(userId, contactId, favorite);
      ack?.({ ok: true, contact });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contact:block', async (raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:block`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { userId: blockedId } = contactTargetSchema.parse(raw);
      await blockUser(userId, blockedId);
      io.to(`user:${blockedId}`).emit('contact:removed', { userId });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('presence:update', async (raw, ack) => {
    try {
      if (!presenceLimiter.consume(userId)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { status } = presenceSchema.parse(raw);
      await setPresence(userId, status);
      await broadcastPresence(userId, status);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'INVALID_PRESENCE' });
    }
  });

  socket.on('kpulse:send', (raw, ack) => {
    void handleKPulseSend(userId, raw, ack, false);
  });

  socket.on('nudge:send', (raw, ack) => {
    void handleKPulseSend(userId, raw, ack, true);
  });

  socket.on('disconnect', (reason) => {
    const { lastSocket } = presenceRuntime.disconnect(userId, socket.id);
    logger.info('socket_disconnected', { userId, socketId: socket.id, reason, lastSocket });

    if (lastSocket) {
      presenceRuntime.markOffline(userId);
      void (async () => {
        try {
          await setPresence(userId, 'offline');
          const audience = await getContactAudience(userId);
          for (const contactId of audience) {
            io.to(`user:${contactId}`).emit('presence:changed', { userId, status: 'offline' });
          }
        } catch (error) {
          logger.warn('presence_disconnect_update_failed', {
            userId,
            error: error instanceof Error ? error.message : 'unknown',
          });
        }
      })();
    }
  });
});

setInterval(() => {
  joinLimiter.clearExpired();
  messageLimiter.clearExpired();
  presenceLimiter.clearExpired();
  socialLimiter.clearExpired();
  wizzLimiter.clearExpired();
}, 60_000).unref();

httpServer.listen(config.PORT, () => {
  logger.info('server_started', { port: config.PORT });
});
