import type { SupportedMediaMime } from './media';

const CHAT_MIMES = new Set<SupportedMediaMime>(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
const VOICE_MIMES = new Set<SupportedMediaMime>(['audio/m4a', 'audio/webm']);
const MAX_VOICE_DURATION_MS = 600_000;

export type ChatContent =
  | { v: 1; type: 'text'; text: string }
  | { v: 1; type: 'media'; mediaId: string; mimeType: SupportedMediaMime; caption?: string }
  | { v: 1; type: 'voice'; mediaId: string; mimeType: SupportedMediaMime; durationMs: number };

export function parseChatContent(value: string): ChatContent {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.v === 1 && parsed.type === 'text' && typeof parsed.text === 'string') {
      return { v: 1, type: 'text', text: parsed.text };
    }
    if (
      parsed.v === 1 && parsed.type === 'media' && typeof parsed.mediaId === 'string'
      && typeof parsed.mimeType === 'string' && CHAT_MIMES.has(parsed.mimeType as SupportedMediaMime)
    ) {
      return {
        v: 1,
        type: 'media',
        mediaId: parsed.mediaId,
        mimeType: parsed.mimeType as SupportedMediaMime,
        ...(typeof parsed.caption === 'string' && parsed.caption.trim() ? { caption: parsed.caption.slice(0, 500) } : {}),
      };
    }
    if (
      parsed.v === 1 && parsed.type === 'voice' && typeof parsed.mediaId === 'string'
      && typeof parsed.mimeType === 'string' && VOICE_MIMES.has(parsed.mimeType as SupportedMediaMime)
      && typeof parsed.durationMs === 'number' && Number.isInteger(parsed.durationMs)
      && parsed.durationMs > 0 && parsed.durationMs <= MAX_VOICE_DURATION_MS
    ) {
      return { v: 1, type: 'voice', mediaId: parsed.mediaId, mimeType: parsed.mimeType as SupportedMediaMime, durationMs: parsed.durationMs };
    }
  } catch {
    // Backward-compatible legacy encrypted text messages are still readable.
  }
  return { v: 1, type: 'text', text: value };
}

export function serializeChatContent(content: ChatContent): string {
  return JSON.stringify(content);
}
