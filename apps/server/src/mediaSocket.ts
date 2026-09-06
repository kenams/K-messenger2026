import type { Socket } from 'socket.io';
import { logger } from './logger.js';

type Ack = ((response: unknown) => void) | undefined;

type RegisterMediaOptions = {
  socket: Socket;
  userId: string;
  consumeRateLimit: (action: string) => boolean;
};

export function registerMediaHandlers({ socket, userId, consumeRateLimit }: RegisterMediaOptions) {
  socket.on('media:prepare-upload', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('prepare-upload')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { prepareMediaUpload } = await import('./mediaService.js');
      const prepared = await prepareMediaUpload(userId, raw);
      ack?.({ ok: true, ...prepared });
    } catch (error) {
      logger.warn('media_prepare_upload_rejected', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('media:complete-upload', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('complete-upload')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { completeMediaUpload } = await import('./mediaService.js');
      const completed = await completeMediaUpload(userId, raw);
      ack?.({ ok: true, ...completed });
    } catch (error) {
      logger.warn('media_complete_upload_rejected', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });

  socket.on('media:prepare-download', async (raw: unknown, ack: Ack) => {
    try {
      if (!consumeRateLimit('prepare-download')) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      const { prepareMediaDownload } = await import('./mediaService.js');
      const prepared = await prepareMediaDownload(userId, raw);
      ack?.({ ok: true, ...prepared });
    } catch (error) {
      logger.warn('media_prepare_download_rejected', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      ack?.({ ok: false, error: 'REJECTED' });
    }
  });
}
