import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { authenticateSocket } from './auth.js';
import { requireActiveDevice, requireConversationMember } from './authorization.js';
import {
  contactRequestSchema,
  contactTargetSchema,
  conversationJoinSchema,
  messageSendSchema,
  presenceSchema,
  wizzSchema,
} from './validation.js';
import { persistEncryptedMessage } from './messageStore.js';
import {
  joinLimiter,
  messageLimiter,
  presenceLimiter,
  socialLimiter,
  wizzLimiter,
} from './rateLimit.js';
import { logger } from './logger.js';
import {
  acceptContact,
  blockUser,
  canWizz,
  getContactAudience,
  listContacts,
  requestContact,
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
  logger.info('socket_connected', { userId, socketId: socket.id });

  socket.on('conversation:join', async (raw, ack) => {
    try {
      if (!joinLimiter.consume(userId)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { conversationId } = conversationJoinSchema.parse(raw);
      await requireConversationMember(userId, conversationId);
      socket.join(`conversation:${conversationId}`);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'FORBIDDEN' });
    }
  });

  socket.on('message:send', async (raw, ack) => {
    try {
      if (!messageLimiter.consume(userId)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const envelope = messageSendSchema.parse(raw);
      await requireConversationMember(userId, envelope.conversationId);
      await requireActiveDevice(userId, envelope.senderDeviceId);

      const stored = await persistEncryptedMessage(userId, envelope);
      if (!stored.duplicate) {
        io.to(`conversation:${envelope.conversationId}`).emit('message:new', {
          ...envelope,
          id: stored.id,
          senderUserId: userId,
          createdAt: stored.createdAt,
        });
      }

      ack?.({
        ok: true,
        id: stored.id,
        duplicate: stored.duplicate,
        clientMessageId: envelope.clientMessageId,
      });
    } catch (error) {
      logger.warn('message_send_rejected', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('contacts:list', async (_raw, ack) => {
    try {
      if (!socialLimiter.consume(`${userId}:list`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const contacts = await listContacts(userId);
      ack?.({ ok: true, contacts });
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

      const visibleStatus = status === 'invisible' ? 'offline' : status;
      const audience = await getContactAudience(userId);
      for (const contactId of audience) {
        io.to(`user:${contactId}`).emit('presence:changed', { userId, status: visibleStatus });
      }
      io.to(`user:${userId}`).emit('presence:self', { userId, status });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'INVALID_PRESENCE' });
    }
  });

  socket.on('nudge:send', async (raw, ack) => {
    try {
      const { recipientId, variant } = wizzSchema.parse(raw);
      if (!wizzLimiter.consume(`${userId}:${recipientId}`)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      await canWizz(userId, recipientId);
      io.to(`user:${recipientId}`).emit('nudge:receive', {
        senderId: userId,
        variant,
        sentAt: new Date().toISOString(),
      });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('disconnect', (reason) => {
    logger.info('socket_disconnected', { userId, socketId: socket.id, reason });
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
