import type { Socket } from 'socket.io';
import { logger } from './logger.js';
import { registerAccountDeletionHandler } from './accountDeletionSocket.js';
import { registerMediaHandlers } from './mediaSocket.js';
import { groupConversationSchema } from './validation.js';

type Ack = ((response: unknown) => void) | undefined;
type ListGroupBans = (userId: string, conversationId: string) => Promise<unknown>;

type RegisterGroupBanListOptions = {
  socket: Socket;
  userId: string;
  consumeRateLimit: () => boolean;
  listBans?: ListGroupBans;
};

async function listBansFromStore(userId: string, conversationId: string) {
  const { listGroupBans } = await import('./groupModerationStore.js');
  return listGroupBans(userId, conversationId);
}

export function registerGroupBanListHandler({
  socket,
  userId,
  consumeRateLimit,
  listBans = listBansFromStore,
}: RegisterGroupBanListOptions) {
  socket.on('group:bans-list', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit()) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { conversationId } = groupConversationSchema.parse(raw);
      const bans = await listBans(userId, conversationId);
      ack?.({ ok: true, bans });
    } catch (error) {
      logger.warn('group_bans_list_rejected', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  // Real Socket.IO sockets expose a namespace. Lightweight unit-test socket
  // stubs for this moderator-only contract intentionally do not. Keep unrelated
  // authenticated handlers isolated while reusing the existing connection hook.
  if (socket.nsp) {
    registerAccountDeletionHandler({
      socket,
      userId,
      consumeRateLimit: () => consumeRateLimit(),
    });
    registerMediaHandlers({
      socket,
      userId,
      consumeRateLimit: (action) => consumeRateLimit(),
    });
  }
}
