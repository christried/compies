// The sliding-window rule behind the vote limit (#1: about 30 votes per User per minute). Pure: the
// limiter in server/utils/rate-limit.ts keeps the hits and asks this rule.

export interface RateLimitOptions {
  /** Hits allowed inside one window. */
  limit: number
  windowMs: number
}

/**
 * Whether one more hit at `now` is allowed, given the earlier hits (epoch ms), and the hits to keep:
 * the ones still inside the window, plus this one when it was allowed.
 */
export function slidingWindow(hits: number[], now: Date, { limit, windowMs }: RateLimitOptions): { allowed: boolean, hits: number[] } {
  const cutoff = now.getTime() - windowMs
  const recent = hits.filter(time => time > cutoff)
  if (recent.length >= limit) return { allowed: false, hits: recent }
  return { allowed: true, hits: [...recent, now.getTime()] }
}
