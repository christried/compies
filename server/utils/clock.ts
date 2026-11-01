import type { H3Event } from 'h3'

/**
 * The server's "now" (ADR 0013: Nuxt owns every timed moment). Every handler whose rule or stored instant depends on the
 * time asks `useClock(event)`, so a test can put a clock into the request context and move it past an instant (#226).
 * Not behind it, because those systems keep their own clock: the vote rate limiter, the R2 signature date, the room
 * token's `exp` and the room-call signature. Database-side `now()` orders rows inside one transaction and stays as it is.
 */
export interface Clock {
  now(): Date
}

declare module 'h3' {
  interface H3EventContext {
    clock?: Clock
  }
}

const realClock: Clock = { now: () => new Date() }

/** The clock of this request: the real one unless a test put one into the context. */
export function useClock(event: H3Event): Clock {
  return event.context.clock ?? realClock
}

/**
 * A clock that stands still until a test moves it.
 * @public Only tests call it, so knip would report it; the test doubles live next to the interface they stand in for.
 */
export function testClock(start: Date | string): Clock & { set(at: Date | string): void, advance(ms: number): void } {
  let current = new Date(start).getTime()
  return {
    now: () => new Date(current),
    set(at) {
      current = new Date(at).getTime()
    },
    advance(ms) {
      current += ms
    },
  }
}
