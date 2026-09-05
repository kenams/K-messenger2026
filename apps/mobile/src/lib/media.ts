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
  byteSize: number;
  purpose: MediaPurpose;
  conversationId?: string;
};

function assertLocalMediaInput(input: UploadLocalMediaInput) {
  if (!input.uri || !Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > 104_857_600) {
    throw new Error('KSSENGER_MEDIA_INVALID_LOCAL_ASSET');
  }
  if (input.purpose === 'chat' && !input.conversationId) throw new Error('KSSENGER_MEDIA_CHAT_CONVERSATION_REQUIRED');
  if (input.purpose !== 'chat' && input.conversationId) throw new Error('KSSENGER_MEDIA_CONVERSATION_NOT_ALLOWED');
}

export async function uploadLocalMedia(input: UploadLocalMediaInput): Promise<{ mediaId: string }> {
  assertLocalMediaInput(input);
  const socket = await getRealtimeSocket();
  const prepared = await emitAck<PreparedUpload>(socket, 'media:prepare-upload', {
    purpose: input.purpose,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
  if (!prepared.ok || !prepared.mediaId || !prepared.upload) throw new Error(prepared.error ?? 'KSSENGER_MEDIA_PREPARE_FAILED');

  // React Native's fetch can materialize the local file/content URI as a Blob.
  // The object-store URL is short-lived and never persisted as application data.
  const localResponse = await fetch(input.uri);
  if (!localResponse.ok) throw new Error('KSSENGER_MEDIA_LOCAL_READ_FAILED');
  const blob = await localResponse.blob();
  if (blob.size !== input.byteSize) throw new Error('KSSENGER_MEDIA_LOCAL_SIZE_CHANGED');

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
