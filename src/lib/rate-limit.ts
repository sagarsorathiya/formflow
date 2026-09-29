/**
 * Shared Redis-backed rate limiter for sensitive mutation endpoints
 * (beyond the login-specific limiter inlined in auth.ts).
 * Fails open if Redis is unreachable — matches the auth.ts pattern of
 * never letting infra trouble block the app outright.
 */

import { env } from "./env";
import { AppError } from "./authz";

interface RateLimitOptions {
  /** Unique key for this limiter bucket, e.g. `ratelimit:test-smtp:${userId}`. */
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function enforceRateLimit({ key, limit, windowSeconds }: RateLimitOptions): Promise<void> {
  try {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
    await redis.connect().catch(() => null);

    const count = await redis.incr(key).catch(() => 0);
    if (count === 1) {
      await redis.expire(key, windowSeconds).catch(() => null);
    }
    await redis.quit().catch(() => null);

    if (count > limit) {
      throw new AppError("RATE_LIMITED", 429, "Too many requests. Please try again later.");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Redis unreachable — fail open, do not block the request on an infra issue.
  }
}
