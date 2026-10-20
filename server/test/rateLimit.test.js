import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowLimiter } from '../src/rateLimit.js';

test('allows up to the limit then blocks with retry-after', () => {
  let now = 0;
  const limiter = new SlidingWindowLimiter(3, 60000, () => now);
  assert.ok(limiter.hit('a').allowed);
  assert.ok(limiter.hit('a').allowed);
  assert.ok(limiter.hit('a').allowed);
  const blocked = limiter.hit('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  now = 60000;
  assert.ok(limiter.hit('a').allowed);
});

test('keys are independent', () => {
  let now = 0;
  const limiter = new SlidingWindowLimiter(1, 60000, () => now);
  assert.ok(limiter.hit('a').allowed);
  assert.ok(limiter.hit('b').allowed);
  assert.equal(limiter.hit('a').allowed, false);
});
