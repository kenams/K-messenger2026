import type { Server, Socket } from 'socket.io';
import { logger } from './logger.js';
import { addGroupSticker, listGroupStickers, removeGroupSticker } from './groupStickerStore.js';
import { groupStickerAddSchema, groupStickerListSchema, groupStickerRemoveSchema } from './validation.js';

type Ack = ((response: unknown) => void) | undefined;

type RegisterGroupStickerOptions = {
  io: Server;
  socket: Socket;
  userId: string;
  consumeRateLimit: (action: string) => boolean;
};

export function registerGroupStickerHandlers({ io, socket, userId, consumeRateLimit }: RegisterGroupStickerOptions) {
  socket.on('group:sticker-list', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('sticker-list')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { conversationId } = groupStickerListSchema.parse(raw);
      const stickers = await listGroupStickers(userId, conversationId);
      ack?.({ ok: true, stickers });
    } catch (error) {
      logger.warn('group_sticker_list_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('group:sticker-add', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('sticker-add')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { conversationId, mediaId } = groupStickerAddSchema.parse(raw);
      const sticker = await addGroupSticker(userId, conversationId, mediaId);
      io.to(`conversation:${conversationId}`).emit('group:sticker-added', { conversationId, sticker });
      ack?.({ ok: true, sticker });
    } catch (error) {
      logger.warn('group_sticker_add_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('group:sticker-remove', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('sticker-remove')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { conversationId, stickerId } = groupStickerRemoveSchema.parse(raw);
      await removeGroupSticker(userId, conversationId, stickerId);
      io.to(`conversation:${conversationId}`).emit('group:sticker-removed', { conversationId, stickerId });
      ack?.({ ok: true });
    } catch (error) {
      logger.warn('group_sticker_remove_rejected', { userId, error: error instanceof Error ? error.message : 'unknown' });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });
}
