// A sliding-window rate limit kept in memory, per key (#1: about 30 votes per User per minute).
// It lives in one server instance, so the limit is per instance; Better Auth's own limiter covers sign-in.

export interface RateLimitOptions {
  /** Hits allowed inside one window. */
  limit: number
  windowMs: number
}

export interface RateLimiter {
  /** Records a hit for `key` and returns false when the key is over its limit. */
  take(key: string, now: Date): boolean
}

export function createRateLimiter({ limit, windowMs }: RateLimitOptions): RateLimiter {
  const hits = new Map<string, number[]>()

  return {
    take(key, now) {
      const cutoff = now.getTime() - windowMs
      const recent = (hits.get(key) ?? []).filter(time => time > cutoff)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(now.getTime())
      hits.set(key, recent)
      return true
    },
  }
}
