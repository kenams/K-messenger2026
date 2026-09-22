import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type ContactAttention = { unread: number; pulse: boolean; lastActivityAt?: number };

const state = new Map<string, ContactAttention>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function bump(contactId: string, patch: Partial<ContactAttention>) {
  const current = state.get(contactId) ?? { unread: 0, pulse: false };
  state.set(contactId, { ...current, ...patch, lastActivityAt: Date.now() });
  notify();
}

/** Most recent message/K-Pulse timestamp for a contact, or 0 if none tracked. */
export function getContactActivity(contactId: string): number {
  return state.get(contactId)?.lastActivityAt ?? 0;
}

/**
 * Seeds the buddy-list sort order from a contact's real last-message time
 * (server data, on contacts load) rather than only live socket events —
 * otherwise the list forgot who you were talking to on every app restart.
 * Never overwrites a more recent value already tracked this session (a live
 * `bump()` from wireContactAttention, or a previous, more current seed).
 */
export function seedContactActivity(contactId: string, timestampMs: number) {
  if (!Number.isFinite(timestampMs)) return;
  const current = state.get(contactId);
  if (current?.lastActivityAt && current.lastActivityAt >= timestampMs) return;
  state.set(contactId, { unread: 0, pulse: false, ...current, lastActivityAt: timestampMs });
  notify();
}

/**
 * Re-renders on ANY contact's attention changing (not just one id) — for the
 * buddy list to re-sort by recent activity ("who just pinged me should be
 * easy to find without scrolling", Kenams 2026-09-21) without polling.
 */
export function useAttentionTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return tick;
}

export function clearContactAttention(contactId: string) {
  if (!state.has(contactId)) return;
  state.delete(contactId);
  notify();
}

export function useContactAttention(contactId: string): ContactAttention {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return state.get(contactId) ?? { unread: 0, pulse: false };
}

/**
 * Wired once near the app root (contacts list is the "who's asking for me"
 * surface Kenams asked for): tracks unread DMs and unacknowledged K-Pulses
 * per contact so the buddy list can badge/blink them without opening the
 * chat first. Only direct messages are tracked — a group message's sender
 * may happen to also be a 1:1 contact, which would badge them without a new
 * DM existing; accepted trade-off to avoid needing conversation-type
 * plumbing here.
 */
export function wireContactAttention(socket: Socket, myUserId: string, knownContactIds: () => Set<string>) {
  const onMessage = ({ senderUserId }: { senderUserId?: string }) => {
    if (!senderUserId || senderUserId === myUserId) return;
    if (!knownContactIds().has(senderUserId)) return;
    const current = state.get(senderUserId) ?? { unread: 0, pulse: false };
    bump(senderUserId, { unread: current.unread + 1 });
  };
  const onPulse = ({ senderId }: { senderId?: string }) => {
    if (!senderId) return;
    bump(senderId, { pulse: true });
  };
  socket.on('message:new', onMessage);
  socket.on('kpulse:receive', onPulse);
  return () => {
    socket.off('message:new', onMessage);
    socket.off('kpulse:receive', onPulse);
  };
}
