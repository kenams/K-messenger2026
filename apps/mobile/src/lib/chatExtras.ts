import { Platform } from 'react-native';

/** One-tap reactions — the "check / dap / rire" set. */
export const QUICK_REACTIONS = ['❤️', '👍', '😂', '👊', '✅', '🔥', '😮', '🙏'] as const;

/** Curated emoji tray for the composer. */
export const EMOJI_TRAY: string[] = [
  '😀', '😂', '🤣', '🥹', '😅', '😊', '😍', '😘', '😎', '🤩',
  '🥳', '😜', '🤪', '🤔', '🫡', '😴', '😮', '😱', '😭', '😤',
  '😡', '🥶', '🤒', '🥲', '😇', '🤗', '🫶', '👍', '👎', '👊',
  '✊', '🙏', '👏', '🙌', '💪', '🤝', '✌️', '🤞', '👀', '🧠',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💯', '✅',
  '❌', '⚡', '🔥', '✨', '🎉', '🎊', '🏆', '⭐', '🌈', '☀️',
  '🍺', '☕', '🍕', '🎵', '⚽', '🏀', '🚀', '💸', '📵', '👑',
];

const HAS_PICTO = /\p{Extended_Pictographic}/u;
const HAS_TEXT = /[0-9A-Za-zÀ-ɏ.,!?;:'"()[\]{}<>@#$%^&*_+=/\\|~`-]/;

/** A message that is only 1–4 emoji renders extra large, like iMessage / WhatsApp. */
export function isBigEmoji(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 12 || HAS_TEXT.test(trimmed) || !HAS_PICTO.test(trimmed)) return false;
  const graphemes = [...trimmed.replace(/[\s️‍\u{1F3FB}-\u{1F3FF}]/gu, '')];
  return graphemes.length >= 1 && graphemes.length <= 4;
}

/** True when an Enter keypress should send instead of inserting a newline (web only). */
export function isSendKey(nativeEvent: { key?: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return Platform.OS === 'web'
    && nativeEvent.key === 'Enter'
    && !nativeEvent.shiftKey
    && !nativeEvent.altKey
    && !nativeEvent.ctrlKey
    && !nativeEvent.metaKey;
}

export type MessageReaction = { userId: string; reaction: string };

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

export function summarizeReactions(reactions: MessageReaction[] | undefined, myUserId: string): ReactionSummary[] {
  if (!reactions?.length) return [];
  const order: string[] = [];
  const counts = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    if (!counts.has(r.reaction)) { counts.set(r.reaction, { count: 0, mine: false }); order.push(r.reaction); }
    const entry = counts.get(r.reaction)!;
    entry.count += 1;
    if (r.userId === myUserId) entry.mine = true;
  }
  return order.map((emoji) => ({ emoji, count: counts.get(emoji)!.count, mine: counts.get(emoji)!.mine }));
}

export function myReaction(reactions: MessageReaction[] | undefined, myUserId: string): string | null {
  return reactions?.find((r) => r.userId === myUserId)?.reaction ?? null;
}
