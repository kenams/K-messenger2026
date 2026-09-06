import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedWindowRateLimiter } from '../src/rateLimit.js';

test('rate limiter enforces the fixed-window quota', () => {
  const limiter = new FixedWindowRateLimiter(2, 1_000, 10);
  assert.equal(limiter.consume('user:action', 0), true);
  assert.equal(limiter.consume('user:action', 100), true);
  assert.equal(limiter.consume('user:action', 200), false);
  assert.equal(limiter.consume('user:action', 1_000), true);
});

test('rate limiter frees expired capacity before rejecting a new key', () => {
  const limiter = new FixedWindowRateLimiter(1, 1_000, 2);
  assert.equal(limiter.consume('a', 0), true);
  assert.equal(limiter.consume('b', 0), true);
  assert.equal(limiter.consume('c', 500), false);
  assert.equal(limiter.consume('c', 1_000), true);
});

test('rate limiter fails closed when live bucket capacity is exhausted', () => {
  const limiter = new FixedWindowRateLimiter(1, 10_000, 2);
  assert.equal(limiter.consume('a', 0), true);
  assert.equal(limiter.consume('b', 0), true);
  assert.equal(limiter.consume('c', 1), false);
  assert.equal(limiter.consume('', 1), false);
});
