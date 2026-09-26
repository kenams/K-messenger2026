import type { Server, Socket } from 'socket.io';
import { logger } from './logger.js';
import { deleteStatus, listVisibleStatuses, postStatus } from './kStatusStore.js';
import { getContactAudience } from './social.js';
import { statusDeleteSchema, statusPostSchema } from './validation.js';

type Ack = ((response: unknown) => void) | undefined;

type RegisterKStatusOptions = {
  io: Server;
  socket: Socket;
  userId: string;
  consumeRateLimit: (action: string) => boolean;
};

export function registerKStatusHandlers({ io, socket, userId, consumeRateLimit }: RegisterKStatusOptions) {
  socket.on('status:post', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('post')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { ciphertext, wrappedKeys } = statusPostSchema.parse(raw);
      const posted = await postStatus(userId, ciphertext, wrappedKeys.map((w) => ({
        viewerUserId: w.viewerUserId,
        wrappedKey: w.wrappedKey,
        wrappedNonce: w.wrappedNonce,
        wrappedByPublicKey: w.wrappedByPublicKey,
      })));
      // Not a conversation — broadcast to each affected contact's own user
      // room, same room presence/K-Pulse already use.
      const audience = await getContactAudience(userId);
      for (const contactId of audience) {
        io.to(`user:${contactId}`).emit('status:posted', { statusId: posted.id, ownerId: userId, createdAt: posted.createdAt, expiresAt: posted.expiresAt });
      }
      ack?.({ ok: true, status: posted });
    } catch (error) {
      logger.warn('k_status_post_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('status:list', async (_raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('list')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const statuses = await listVisibleStatuses(userId);
      ack?.({ ok: true, statuses });
    } catch (error) {
      logger.warn('k_status_list_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('status:delete', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('delete')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { statusId } = statusDeleteSchema.parse(raw);
      await deleteStatus(userId, statusId);
      const audience = await getContactAudience(userId);
      for (const contactId of audience) {
        io.to(`user:${contactId}`).emit('status:deleted', { statusId, ownerId: userId });
      }
      ack?.({ ok: true });
    } catch (error) {
      logger.warn('k_status_delete_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });
}
