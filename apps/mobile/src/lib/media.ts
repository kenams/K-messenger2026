import { emitAck, getRealtimeSocket } from './realtime';

export type MediaPurpose = 'avatar' | 'chat' | 'kfeed' | 'moment';
export type SupportedMediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/quicktime';

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

function assertLocalMediaInput(input: UploadLocalMediaInput) {
  if (!input.uri) throw new Error('KSSENGER_MEDIA_INVALID_LOCAL_ASSET');
  if (input.byteSize !== undefined && (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_MEDIA_BYTES)) {
    throw new Error('KSSENGER_MEDIA_INVALID_LOCAL_ASSET');
  }
  if (input.purpose === 'chat' && !input.conversationId) throw new Error('KSSENGER_MEDIA_CHAT_CONVERSATION_REQUIRED');
  if (input.purpose !== 'chat' && input.conversationId) throw new Error('KSSENGER_MEDIA_CONVERSATION_NOT_ALLOWED');
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
  const prepared = await emitAck<PreparedUpload>(socket, 'media:prepare-upload', {
    purpose: input.purpose,
    mimeType: input.mimeType,
    byteSize: actualByteSize,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
  if (!prepared.ok || !prepared.mediaId || !prepared.upload) throw new Error(prepared.error ?? 'KSSENGER_MEDIA_PREPARE_FAILED');

  const uploaded = await fetch(prepared.upload.url, {
    method: 'PUT',
    headers: prepared.upload.headers,
    body: blob,
  });
  if (!uploaded.ok) throw new Error(`KSSENGER_MEDIA_UPLOAD_${uploaded.status}`);

  const completed = await emitAck<CompletedUpload>(socket, 'media:complete-upload', { mediaId: prepared.mediaId });
  if (!completed.ok || completed.status !== 'ready') throw new Error(completed.error ?? 'KSSENGER_MEDIA_VERIFY_FAILED');
  return { mediaId: prepared.mediaId };
}

export async function getMediaDownload(mediaId: string) {
  const socket = await getRealtimeSocket();
  const prepared = await emitAck<PreparedDownload>(socket, 'media:prepare-download', { mediaId });
  if (!prepared.ok || !prepared.download) throw new Error(prepared.error ?? 'KSSENGER_MEDIA_DOWNLOAD_FAILED');
  return prepared.download;
}
