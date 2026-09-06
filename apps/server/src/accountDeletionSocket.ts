import type { Socket } from 'socket.io';
import { logger } from './logger.js';

type Ack = ((response: unknown) => void) | undefined;
type DeleteOwnAccount = (userId: string, raw: unknown) => Promise<void>;

type RegisterAccountDeletionOptions = {
  socket: Socket;
  userId: string;
  consumeRateLimit: () => boolean;
  deleteOwnAccount?: DeleteOwnAccount;
};

async function deleteOwnAccountFromService(userId: string, raw: unknown) {
  const { authorizeAndDeleteOwnAccount } = await import('./accountDeletion.js');
  return authorizeAndDeleteOwnAccount(userId, raw);
}

export function registerAccountDeletionHandler({
  socket,
  userId,
  consumeRateLimit,
  deleteOwnAccount = deleteOwnAccountFromService,
}: RegisterAccountDeletionOptions) {
  socket.on('account:delete', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit()) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      await deleteOwnAccount(userId, raw);
      ack?.({ ok: true });

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
