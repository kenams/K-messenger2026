import type { Socket } from 'socket.io';
import { logger } from './logger.js';
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
  // Load the database-backed store only after the authenticated/rate-limited
  // request contract has passed validation. This keeps contract tests isolated
  // from production secrets without changing runtime authorization semantics.
  const { listGroupBans } = await import('./groupModerationStore.js');
  return listGroupBans(userId, conversationId);
}

/**
 * Registers the moderator-only ban-list read path plus the destructive account
 * self-delete path. Both inherit identity from the already-authenticated socket.
 */
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

  socket.on('account:delete', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit()) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { authorizeAndDeleteOwnAccount } = await import('./accountDeletion.js');
      await authorizeAndDeleteOwnAccount(userId, raw);
      ack?.({ ok: true });

      // The provider deletion removes the account directory entry and cascades
      // K-ssenger-owned data. Drop every live socket for the deleted identity so
      // already-open sessions cannot continue using stale realtime connections.
      const timer = setTimeout(() => {
        socket.nsp.in(`user:${userId}`).disconnectSockets(true);
      }, 25);
      timer.unref();
    } catch (error) {
      logger.warn('account_delete_rejected', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });
}
