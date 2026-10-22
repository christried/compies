import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../../server/utils/rate-limit'

const start = new Date('2026-10-22T10:00:00Z')

describe('createRateLimiter', () => {
  it('allows up to the limit within the window, then refuses', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })

    expect(limiter.take('user-a', start)).toBe(true)
    expect(limiter.take('user-a', start)).toBe(true)
    expect(limiter.take('user-a', start)).toBe(false)
  })

  it('allows again once the oldest hit has left the window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })
    limiter.take('user-a', start)
    limiter.take('user-a', new Date(start.getTime() + 30_000))

    expect(limiter.take('user-a', new Date(start.getTime() + 59_000))).toBe(false)
    expect(limiter.take('user-a', new Date(start.getTime() + 60_000))).toBe(true)
  })

  it('counts each key separately', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })

    expect(limiter.take('user-a', start)).toBe(true)
    expect(limiter.take('user-b', start)).toBe(true)
    expect(limiter.take('user-a', start)).toBe(false)
  })
})
