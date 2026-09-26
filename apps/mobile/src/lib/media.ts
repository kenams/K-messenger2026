import { emitAck, getRealtimeSocket, waitForSocketReady } from './realtime';
import type { Socket } from 'socket.io-client';

export type MediaPurpose = 'avatar' | 'chat' | 'kfeed' | 'moment';
export type SupportedMediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/quicktime' | 'audio/m4a' | 'audio/webm';

type PreparedUpload = {
  ok: boolean;
  error?: string;
  mediaId?: string;
  objectKey?: string;
  upload?: {
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    expiresAt: string;
  };
};

type CompletedUpload = { ok: boolean; error?: string; mediaId?: string; status?: 'ready' };
type PreparedDownload = {
  ok: boolean;
  error?: string;
  mediaId?: string;
  download?: { url: string; method: string; headers: Record<string, string>; expiresAt: string };
};

export type UploadLocalMediaInput = {
  uri: string;
  mimeType: SupportedMediaMime;
  /** Picker metadata is optional on real devices. The actual Blob size is authoritative. */
  byteSize?: number;
  purpose: MediaPurpose;
  conversationId?: string;
};

const MAX_MEDIA_BYTES = 104_857_600;
const MIN_SIGNED_URL_LIFETIME_MS = 5_000;

function assertLocalMediaInput(input: UploadLocalMediaInput) {
  if (!input.uri) throw new Error('KSSENGER_MEDIA_INVALID_LOCAL_ASSET');
  if (input.byteSize !== undefined && (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_MEDIA_BYTES)) {
    throw new Error('KSSENGER_MEDIA_INVALID_LOCAL_ASSET');
  }
  if (input.purpose === 'chat' && !input.conversationId) throw new Error('KSSENGER_MEDIA_CHAT_CONVERSATION_REQUIRED');
  if (input.purpose !== 'chat' && input.conversationId) throw new Error('KSSENGER_MEDIA_CONVERSATION_NOT_ALLOWED');
}

function assertSignedMediaRequest(
  request: { url: string; method: string; headers: Record<string, string>; expiresAt: string },
  expectedMethod: 'GET' | 'PUT',
) {
  if (request.method.toUpperCase() !== expectedMethod) throw new Error('KSSENGER_MEDIA_INVALID_SIGNED_REQUEST');
  let parsed: URL;
  try {
    parsed = new URL(request.url);
  } catch {
    throw new Error('KSSENGER_MEDIA_INVALID_SIGNED_REQUEST');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('KSSENGER_MEDIA_INVALID_SIGNED_REQUEST');
  }
  const expiresAt = Date.parse(request.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + MIN_SIGNED_URL_LIFETIME_MS) {
    throw new Error('KSSENGER_MEDIA_SIGNED_REQUEST_EXPIRED');
  }
  if (!request.headers || typeof request.headers !== 'object' || Array.isArray(request.headers)) {
    throw new Error('KSSENGER_MEDIA_INVALID_SIGNED_REQUEST');
  }
}

// Same disconnect-window issue documented in DirectConversationScreen's
// message:send / message:delete: this app's realtime connection cycles
// under load, and emitAck rejects instantly (not after waiting) whenever a
// request happens to land mid-reconnect (see realtime.ts). Voice notes and
// picked media go through this exact window every time — recording/picking
// takes a few seconds, which is plenty of time for a cycle to land right as
// prepare/complete fires. message:send and message:delete already retry
// against the real 'connect' event instead of a blind delay; media uploads
// never got the same treatment, so every "recording works but never sends"
// report traces back to prepare-upload or complete-upload eating a
// REALTIME_DISCONNECTED/REALTIME_TIMEOUT with no retry and no visible error.
async function emitAckWithRetry<TResponse>(socket: Socket, event: string, payload: unknown): Promise<TResponse> {
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await waitForSocketReady(socket, 2500);
    try {
      return await emitAck<TResponse>(socket, event, payload);
    } catch (error) {
      lastError = error;
    }
  }
  console.error('[media] emitAck exhausted retries', { event, error: lastError instanceof Error ? lastError.message : String(lastError) });
  throw lastError instanceof Error ? lastError : new Error('KSSENGER_MEDIA_ACK_UNAVAILABLE');
}

export async function uploadLocalMedia(input: UploadLocalMediaInput): Promise<{ mediaId: string }> {
  assertLocalMediaInput(input);

  // Expo's picker does not guarantee fileSize on every Android/iOS provider.
  // Read the selected local asset first and use its real Blob size as the only
  // size sent to the server. The server still independently verifies the
  // uploaded object's MIME/size before promoting it to ready.
  const localResponse = await fetch(input.uri);
  if (!localResponse.ok) throw new Error('KSSENGER_MEDIA_LOCAL_READ_FAILED');
  const blob = await localResponse.blob();
  const actualByteSize = blob.size;
  if (!Number.isSafeInteger(actualByteSize) || actualByteSize <= 0 || actualByteSize > MAX_MEDIA_BYTES) {
    throw new Error('KSSENGER_MEDIA_INVALID_LOCAL_ASSET');
  }

  const socket = await getRealtimeSocket();
  const prepared = await emitAckWithRetry<PreparedUpload>(socket, 'media:prepare-upload', {
    purpose: input.purpose,
    mimeType: input.mimeType,
    byteSize: actualByteSize,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
  if (!prepared.ok || !prepared.mediaId || !prepared.upload) throw new Error(prepared.error ?? 'KSSENGER_MEDIA_PREPARE_FAILED');
  assertSignedMediaRequest(prepared.upload, 'PUT');

  const uploaded = await fetch(prepared.upload.url, {
    method: 'PUT',
    headers: prepared.upload.headers,
    body: blob,
  });
  if (!uploaded.ok) throw new Error(`KSSENGER_MEDIA_UPLOAD_${uploaded.status}`);

  const completed = await emitAckWithRetry<CompletedUpload>(socket, 'media:complete-upload', { mediaId: prepared.mediaId });
  if (!completed.ok || completed.status !== 'ready') throw new Error(completed.error ?? 'KSSENGER_MEDIA_VERIFY_FAILED');
  return { mediaId: prepared.mediaId };
}

export async function getMediaDownload(mediaId: string) {
  const socket = await getRealtimeSocket();
  const prepared = await emitAck<PreparedDownload>(socket, 'media:prepare-download', { mediaId });
  if (!prepared.ok || !prepared.download) throw new Error(prepared.error ?? 'KSSENGER_MEDIA_DOWNLOAD_FAILED');
  assertSignedMediaRequest(prepared.download, 'GET');
  return prepared.download;
}
