export function createTokenBucketRateLimiter({
  capacity = 60,
  refillPerSecond = 1,
  maxEntries = 10_000,
  idleTtlMs = 15 * 60 * 1000,
} = {}) {
  const safeCapacity = Math.max(1, Number(capacity) || 60);
  const safeRefillPerMs = Math.max(0.001, Number(refillPerSecond) || 1) / 1000;
  const safeMaxEntries = Math.max(100, Number(maxEntries) || 10_000);
  const safeIdleTtlMs = Math.max(60_000, Number(idleTtlMs) || 15 * 60 * 1000);
  const buckets = new Map();

  function prune(now) {
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.lastSeenAt >= safeIdleTtlMs) buckets.delete(key);
    }
  }

  function consume(rawKey, { now = Date.now() } = {}) {
    const key = String(rawKey || "unknown").trim() || "unknown";
    let bucket = buckets.get(key);

    if (!bucket && buckets.size >= safeMaxEntries) {
      prune(now);
      if (buckets.size >= safeMaxEntries) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(1 / (safeRefillPerMs * 1000))),
          reason: "capacity",
        };
      }
    }

    if (!bucket) {
      bucket = { tokens: safeCapacity, updatedAt: now, lastSeenAt: now };
      buckets.set(key, bucket);
    } else {
      const elapsed = Math.max(0, now - bucket.updatedAt);
      bucket.tokens = Math.min(safeCapacity, bucket.tokens + elapsed * safeRefillPerMs);
      bucket.updatedAt = now;
      bucket.lastSeenAt = now;
    }

    if (bucket.tokens < 1) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / (safeRefillPerMs * 1000))),
        reason: "rate",
      };
    }

    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterSeconds: 0,
      reason: null,
    };
  }

  return { consume, prune, size: () => buckets.size };
}
