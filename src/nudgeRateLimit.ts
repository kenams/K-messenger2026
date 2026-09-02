// Nudge/Wizz anti-spam: cooldown per (sender, conversation) + rolling cap.
const COOLDOWN_MS = 3000;
const MAX_PER_MINUTE = 6;

type Bucket = { lastAt: number; timestamps: number[] };
const buckets = new Map<string, Bucket>();

export function checkNudgeAllowed(senderUserId: string, conversationId: string, now = Date.now()): { allowed: true } | { allowed: false; reason: string } {
  const key = `${senderUserId}:${conversationId}`;
  const bucket = buckets.get(key) ?? { lastAt: -Infinity, timestamps: [] };

  if (now - bucket.lastAt < COOLDOWN_MS) {
    return { allowed: false, reason: "cooldown" };
  }

  const windowStart = now - 60_000;
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
  if (bucket.timestamps.length >= MAX_PER_MINUTE) {
    return { allowed: false, reason: "rate_limited" };
  }

  bucket.lastAt = now;
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true };
}

/** Test-only helper. */
export function _resetNudgeRateLimit() {
  buckets.clear();
}
