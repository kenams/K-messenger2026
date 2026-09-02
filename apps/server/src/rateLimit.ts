type Bucket = { count: number; resetAt: number };

export class FixedWindowRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  consume(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
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
