// The Countdown (GLOSSARY: Countdown; spec #218 § Countdown, #236). One per Event, during a running Session: the Host sets it,
// starts, pauses, resumes or resets it, and every Member sees it run down to the same instant. Pure, so the server enforces
// the rules and the client shows the same facts. The stored row is its duration plus either its start instant (running) or
// its remaining time (paused); the end of a running one is `startedAt + remainingMs` (ADR 0013: the instants come from Nuxt).

import type { Instant } from './session-state'

/** The shortest Countdown the Host can set, in seconds (spec #218: 5 s). */
export const COUNTDOWN_MIN_S = 5
/** The longest one, in seconds: 99:59. */
export const COUNTDOWN_MAX_S = 5999

/** What the rules need of a Countdown: its duration, the time left as it was stored, and the start instant while it runs. */
export interface CountdownFacts {
  durationMs: number
  remainingMs: number
  /** When it was started or resumed; null while it is ready, paused or at zero. */
  startedAt: Instant | null
}

/** `ready`: not started, the full duration. `paused`: not running, some time left. `running`: until its end instant. `ended`: at zero. */
export type CountdownState = 'ready' | 'paused' | 'running' | 'ended'

/** The changes the Host makes to a Countdown. */
export type CountdownAction = 'start' | 'pause' | 'reset' | 'set'

/** Why a change is refused: no Countdown to change, one that runs, one that ended (start only), or one that does not run (pause only). */
export type CountdownRejection = 'no_countdown' | 'countdown_running' | 'countdown_ended' | 'countdown_not_running'

const msOf = (at: Instant): number => (typeof at === 'number' ? at : new Date(at).getTime())

/** The instant a started Countdown ends, in epoch ms: its start plus the time it was started with. */
function endsAtMs(startedAt: Instant, remainingMs: number): number {
  return msOf(startedAt) + remainingMs
}

/**
 * The length the Host typed, in seconds, from the minutes (0 to 99) and seconds (0 to 59) fields (#236), or null when a field is not
 * a whole number in that range or the length is outside 5 s to 99:59. Both the sheet and the rule's limits come from here.
 */
export function countdownSeconds(minutes: string, seconds: string): number | null {
  if (!/^\d{1,2}$/.test(minutes) || !/^\d{1,2}$/.test(seconds)) return null
  const total = Number(minutes) * 60 + Number(seconds)
  return Number(seconds) <= 59 && total >= COUNTDOWN_MIN_S && total <= COUNTDOWN_MAX_S ? total : null
}

/** The state of a Countdown at `nowMs` (epoch ms). */
export function countdownState(c: CountdownFacts, nowMs: number): CountdownState {
  if (c.remainingMs === 0) return 'ended'
  if (c.startedAt !== null) return endsAtMs(c.startedAt, c.remainingMs) > nowMs ? 'running' : 'ended'
  return c.remainingMs === c.durationMs ? 'ready' : 'paused'
}

/** The time left at `nowMs`: the end instant minus now while it is started, never below zero; the stored remainder otherwise. */
export function remainingMsAt(c: CountdownFacts, nowMs: number): number {
  if (c.startedAt === null) return c.remainingMs
  return Math.max(0, endsAtMs(c.startedAt, c.remainingMs) - nowMs)
}

/**
 * Why the Host's change is refused, or null when it may run (spec #218 § Countdown). `c` is null while the Event has no
 * Countdown. `set` makes one from nothing; `reset` is always allowed once one exists. Start also resumes a paused one.
 */
export function countdownRejection(action: CountdownAction, c: CountdownFacts | null, nowMs: number): CountdownRejection | null {
  if (c === null) return action === 'set' ? null : 'no_countdown'
  const state = countdownState(c, nowMs)
  switch (action) {
    case 'start':
      if (state === 'running') return 'countdown_running'
      return state === 'ended' ? 'countdown_ended' : null
    case 'pause':
      return state === 'running' ? null : 'countdown_not_running'
    case 'set':
      return state === 'running' ? 'countdown_running' : null
    case 'reset':
      return null
  }
}
