import type { Socket } from 'socket.io';
import { listGroupBans } from './groupModerationStore.js';
import { logger } from './logger.js';
import { groupConversationSchema } from './validation.js';

type Ack = ((response: unknown) => void) | undefined;

type RegisterGroupBanListOptions = {
  socket: Socket;
  userId: string;
  consumeRateLimit: () => boolean;
};

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
}: RegisterGroupBanListOptions) {
  socket.on('group:bans-list', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit()) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { conversationId } = groupConversationSchema.parse(raw);
      const bans = await listGroupBans(userId, conversationId);
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
