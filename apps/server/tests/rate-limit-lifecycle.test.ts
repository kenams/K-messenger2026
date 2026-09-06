import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from '../src/rateLimit.js';

describe('FixedWindowRateLimiter bounded lifecycle', () => {
  it('enforces the fixed-window quota', () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000, 10);
    expect(limiter.consume('user:action', 0)).toBe(true);
    expect(limiter.consume('user:action', 100)).toBe(true);
    expect(limiter.consume('user:action', 200)).toBe(false);
    expect(limiter.consume('user:action', 1_000)).toBe(true);
  });

  it('frees expired capacity before rejecting a new key', () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000, 2);
    expect(limiter.consume('a', 0)).toBe(true);
    expect(limiter.consume('b', 0)).toBe(true);
    expect(limiter.consume('c', 500)).toBe(false);
    expect(limiter.consume('c', 1_000)).toBe(true);
  });

  it('fails closed when live bucket capacity is exhausted', () => {
    const limiter = new FixedWindowRateLimiter(1, 10_000, 2);
    expect(limiter.consume('a', 0)).toBe(true);
    expect(limiter.consume('b', 0)).toBe(true);
    expect(limiter.consume('c', 1)).toBe(false);
    expect(limiter.consume('', 1)).toBe(false);
  });
});
