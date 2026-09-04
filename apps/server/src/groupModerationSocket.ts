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
 * Registers the moderator-only ban-list read path.
 *
 * Identity always comes from the already-authenticated Socket.IO session. The
 * request contract contains only a strict conversation UUID; actor/role fields
 * supplied by clients are rejected before the store performs its transactional
 * owner/admin authorization check.
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
}
