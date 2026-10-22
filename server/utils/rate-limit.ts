import { slidingWindow, type RateLimitOptions } from '../domain/rate-limit'

// A rate limit kept in memory, per key. It lives in one server instance, so the limit is per
// instance; Better Auth's own limiter covers sign-in. The window rule is in server/domain/rate-limit.ts.

export interface RateLimiter {
  /** Records a hit for `key` and returns false when the key is over its limit. */
  take(key: string, now: Date): boolean
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const hitsByKey = new Map<string, number[]>()

  return {
    take(key, now) {
      const { allowed, hits } = slidingWindow(hitsByKey.get(key) ?? [], now, options)
      hitsByKey.set(key, hits)
      return allowed
    },
  }
}
