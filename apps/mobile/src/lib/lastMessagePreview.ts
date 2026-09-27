import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { emitAck } from './realtime';
import { readMessageText } from './chatTransport';
import { ENCRYPTED_ALGO, decryptDirectMessage, fetchPeerPublicKey, loadExistingSecretKey } from './e2ee';
import { GROUP_ENCRYPTED_ALGO, decryptGroupMessage, ensureGroupKey } from './groupE2ee';

/**
 * Last-message previews for the conversation list.
 *
 * Direct messages are end-to-end encrypted, so the server can only tell us
 * *that* a message exists. The preview is decrypted on this device and kept
 * in memory only (never written to storage, never logged) — a reload simply
 * re-derives it from history.
 */
export type Preview = { messageId: string; text: string };

const cache = new Map<string, Preview>();
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();
const peerKeys = new Map<string, string>();

function emit() { listeners.forEach((listener) => listener()); }

export function getPreview(conversationId: string): Preview | undefined {
  return cache.get(conversationId);
}

/** Called by an open conversation so the list reflects what was just sent/received. */
export function setPreview(conversationId: string, messageId: string, text: string) {
  const current = cache.get(conversationId);
  if (current && current.messageId === messageId && current.text === text) return;
  cache.set(conversationId, { messageId, text });
  emit();
}

export function usePreviewTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((value) => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return tick;
}

/** Human one-liner for any serialized chat payload. */
export function summarizePayload(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && parsed.v === 1) {
      if (parsed.type === 'text' && typeof parsed.text === 'string') return parsed.text;
      if (parsed.type === 'voice') return '🎤 Message vocal';
      if (parsed.type === 'sticker') return '🖼️ Sticker';
      if (parsed.type === 'media') {
        const mime = typeof parsed.mimeType === 'string' ? parsed.mimeType : '';
        const caption = typeof parsed.caption === 'string' && parsed.caption.trim() ? ` · ${parsed.caption.trim()}` : '';
        return `${mime.startsWith('video/') ? '🎬 Vidéo' : '📷 Photo'}${caption}`;
      }
    }
  } catch {
    // plain string payload
  }
  return raw;
}

type HistoryMessage = { id: string; algorithm: string; ciphertext?: string; deletedAt?: string | null };

/** Fetch + decrypt the newest message of a direct conversation, once per message id. */
export function loadDirectPreview(client: Socket, userId: string, conversationId: string, peerId: string, messageId: string): Promise<void> {
  const existing = cache.get(conversationId);
  if (existing && existing.messageId === messageId) return Promise.resolve();
  const key = `${conversationId}:${messageId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      const response = await emitAck<{ ok: boolean; messages?: HistoryMessage[] }>(client, 'conversation:history', { conversationId, limit: 1 });
      const last = response.ok ? response.messages?.[response.messages.length - 1] : undefined;
      if (!last) return;
      if (last.deletedAt) { setPreview(conversationId, last.id, 'Message supprimé'); return; }
      if (last.algorithm !== ENCRYPTED_ALGO) { setPreview(conversationId, last.id, summarizePayload(readMessageText(last))); return; }
      // Read-only: a preview must never create/publish a keypair.
      const mySecretKey = await loadExistingSecretKey(userId);
      let peerKey = peerKeys.get(peerId) ?? null;
      if (!peerKey) {
        peerKey = await fetchPeerPublicKey(peerId);
        if (peerKey) peerKeys.set(peerId, peerKey);
      }
      const opened = mySecretKey && peerKey ? decryptDirectMessage(last.ciphertext ?? '', mySecretKey, peerKey) : null;
      if (!opened) peerKeys.delete(peerId); // peer may have rotated keys — refetch next time
      setPreview(conversationId, last.id, opened ? summarizePayload(opened) : '🔒 Message chiffré');
    } catch {
      // Preview is cosmetic — the row falls back to a neutral label.
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

/**
 * Fetch + decrypt the newest message of a group conversation, once per
 * message id. Uses the same group-key wrapping (`ensureGroupKey`) the open
 * chat screen relies on — a member opening the Chats hub is already a real
 * member, so lazily creating/wrapping the group key here (if missing) is
 * safe and matches `GroupEncryptedChat.tsx`'s own behaviour, unlike the
 * direct-preview case above which must never touch identity-key publishing.
 */
export function loadGroupPreview(client: Socket, userId: string, conversationId: string, memberIds: string[], messageId: string): Promise<void> {
  const existing = cache.get(conversationId);
  if (existing && existing.messageId === messageId) return Promise.resolve();
  const key = `${conversationId}:${messageId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      const response = await emitAck<{ ok: boolean; messages?: HistoryMessage[] }>(client, 'conversation:history', { conversationId, limit: 1 });
      const last = response.ok ? response.messages?.[response.messages.length - 1] : undefined;
      if (!last) return;
      if (last.deletedAt) { setPreview(conversationId, last.id, 'Message supprimé'); return; }
      if (last.algorithm !== GROUP_ENCRYPTED_ALGO) { setPreview(conversationId, last.id, summarizePayload(readMessageText(last))); return; }
      const groupKey = await ensureGroupKey(conversationId, userId, memberIds);
      const opened = groupKey ? decryptGroupMessage(last.ciphertext ?? '', groupKey) : null;
      setPreview(conversationId, last.id, opened ? summarizePayload(opened) : '🔒 Message de groupe chiffré');
    } catch {
      // Preview is cosmetic — the row falls back to a neutral label.
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}
