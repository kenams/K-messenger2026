import type { Server, Socket } from 'socket.io';
import { logger } from './logger.js';
import {
  linkInitSchema,
  linkApproveSchema,
  linkTargetSchema,
  linkEnvelopeSchema,
  initDeviceLink,
  approveDeviceLink,
  revokeDeviceLink,
  requireApprovedLinkOwner,
} from './deviceLinkStore.js';

type Ack = ((response: unknown) => void) | undefined;

type RegisterDeviceLinkOptions = {
  io: Server;
  socket: Socket;
  userId: string;
  consumeRateLimit: (action: string) => boolean;
};

export function registerDeviceLinkHandlers({ io, socket, userId, consumeRateLimit }: RegisterDeviceLinkOptions) {
  socket.on('link:init', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('link-init')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { webPublicKey } = linkInitSchema.parse(raw);
      const result = await initDeviceLink(userId, webPublicKey);
      io.to(`user:${userId}`).except(socket.id).emit('link:pending', { linkId: result.linkId, webPublicKey });
      ack?.({ ok: true, ...result });
    } catch (error) {
      logger.warn('link_init_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('link:approve', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('link-approve')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { linkId, phonePublicKey } = linkApproveSchema.parse(raw);
      const link = await approveDeviceLink(userId, linkId, phonePublicKey);
      io.to(`user:${userId}`).emit('link:approved', { linkId: link.id, phonePublicKey });
      ack?.({ ok: true, linkId: link.id });
    } catch (error) {
      logger.warn('link_approve_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('link:revoke', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('link-revoke')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { linkId } = linkTargetSchema.parse(raw);
      const result = await revokeDeviceLink(userId, linkId);
      io.to(`user:${userId}`).emit('link:revoked', { linkId: result.linkId });
      ack?.({ ok: true });
    } catch (error) {
      logger.warn('link_revoke_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('link:envelope', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('link-envelope')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const envelope = linkEnvelopeSchema.parse(raw);
      // Fails closed unless this exact user owns an approved link with this
      // id — a stranger cannot relay traffic onto someone else's pairing,
      // and a link that was never approved (or was revoked) accepts nothing.
      await requireApprovedLinkOwner(userId, envelope.linkId);
      io.to(`user:${userId}`).except(socket.id).emit('link:envelope', {
        linkId: envelope.linkId,
        ciphertext: envelope.ciphertext,
        nonce: envelope.nonce,
      });
      ack?.({ ok: true });
    } catch (error) {
      logger.warn('link_envelope_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });
}
