import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { authenticateSocket } from './auth.js';
import { requireActiveDevice, requireConversationMember } from './authorization.js';
import { messageSendSchema, presenceSchema } from './validation.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '64kb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.CORS_ORIGIN, credentials: true },
  maxHttpBufferSize: 2_100_000,
});

io.use(async (socket, next) => {
  try {
    socket.data.userId = await authenticateSocket(socket);
    next();
  } catch {
    next(new Error('UNAUTHENTICATED'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);

  socket.on('conversation:join', async (raw, ack) => {
    try {
      const conversationId = String(raw?.conversationId ?? '');
      await requireConversationMember(userId, conversationId);
      socket.join(`conversation:${conversationId}`);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'FORBIDDEN' });
    }
  });

  socket.on('message:send', async (raw, ack) => {
    try {
      const envelope = messageSendSchema.parse(raw);
      await requireConversationMember(userId, envelope.conversationId);
      await requireActiveDevice(userId, envelope.senderDeviceId);
      io.to(`conversation:${envelope.conversationId}`).emit('message:new', envelope);
      ack?.({ ok: true, clientMessageId: envelope.clientMessageId });
    } catch {
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('presence:update', async (raw, ack) => {
    try {
      const { status } = presenceSchema.parse(raw);
      io.emit('presence:changed', { userId, status });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'INVALID_PRESENCE' });
    }
  });
});

httpServer.listen(config.PORT, () => {
  console.log(`K-ssenger server listening on :${config.PORT}`);
});
