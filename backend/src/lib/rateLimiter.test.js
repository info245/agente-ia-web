import assert from "node:assert/strict";
import test from "node:test";

import { createTokenBucketRateLimiter } from "./rateLimiter.js";

test("limita por clave y repone capacidad con el tiempo", () => {
  const limiter = createTokenBucketRateLimiter({ capacity: 2, refillPerSecond: 1 });

  assert.equal(limiter.consume("cuenta:ip", { now: 0 }).allowed, true);
  assert.equal(limiter.consume("cuenta:ip", { now: 0 }).allowed, true);
  const limited = limiter.consume("cuenta:ip", { now: 0 });
  assert.equal(limited.allowed, false);
  assert.equal(limited.retryAfterSeconds, 1);
  assert.equal(limiter.consume("cuenta:ip", { now: 1_000 }).allowed, true);
});

test("mantiene buckets independientes por cuenta e IP", () => {
  const limiter = createTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1 });

  assert.equal(limiter.consume("a:1", { now: 0 }).allowed, true);
  assert.equal(limiter.consume("a:1", { now: 0 }).allowed, false);
  assert.equal(limiter.consume("a:2", { now: 0 }).allowed, true);
  assert.equal(limiter.consume("b:1", { now: 0 }).allowed, true);
});
