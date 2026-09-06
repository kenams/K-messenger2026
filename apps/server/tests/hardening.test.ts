import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from '../src/rateLimit.js';
import { sanitizeLogContext } from '../src/logger.js';

describe('FixedWindowRateLimiter', () => {
  it('rejects after the configured limit and resets after the window', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);
    expect(limiter.consume('alice', 0)).toBe(true);
    expect(limiter.consume('alice', 1)).toBe(true);
    expect(limiter.consume('alice', 2)).toBe(false);
    expect(limiter.consume('alice', 1000)).toBe(true);
  });
});

describe('safe logger', () => {
  it('redacts secrets, ciphertext and precise location recursively', () => {
    const result = sanitizeLogContext({
      accessToken: 'secret',
      nested: { privateKey: 'secret2', latitude: 43.6, longitude: 1.44 },
      ciphertext: 'opaque-but-sensitive',
      ok: 'visible',
    }) as Record<string, unknown>;

    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.ciphertext).toBe('[REDACTED]');
    expect(result.ok).toBe('visible');
    expect((result.nested as Record<string, unknown>).privateKey).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).latitude).toBe('[REDACTED]');
  });
});
