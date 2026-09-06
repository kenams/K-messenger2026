type Bucket = { count: number; resetAt: number };

const DEFAULT_MAX_BUCKETS = 50_000;
const CLEANUP_EVERY_CONSUMES = 256;

export class FixedWindowRateLimiter {
  private buckets = new Map<string, Bucket>();
  private consumesSinceCleanup = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxBuckets = DEFAULT_MAX_BUCKETS,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('RATE_LIMIT_INVALID_LIMIT');
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error('RATE_LIMIT_INVALID_WINDOW');
    if (!Number.isInteger(maxBuckets) || maxBuckets < 1) throw new Error('RATE_LIMIT_INVALID_CAPACITY');
  }

  consume(key: string, now = Date.now()): boolean {
    if (!key) return false;

    this.consumesSinceCleanup += 1;
    if (this.consumesSinceCleanup >= CLEANUP_EVERY_CONSUMES) {
      this.clearExpired(now);
      this.consumesSinceCleanup = 0;
    }

    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      if (!bucket && this.buckets.size >= this.maxBuckets) {
        this.clearExpired(now);
        if (this.buckets.size >= this.maxBuckets) return false;
      }
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }

  clearExpired(now = Date.now()) {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}

export const messageLimiter = new FixedWindowRateLimiter(120, 60_000);
export const presenceLimiter = new FixedWindowRateLimiter(30, 60_000);
export const joinLimiter = new FixedWindowRateLimiter(60, 60_000);
export const socialLimiter = new FixedWindowRateLimiter(30, 60_000);
export const wizzLimiter = new FixedWindowRateLimiter(6, 60_000);
