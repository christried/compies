// The Coin flip (GLOSSARY: Coin flip; spec #218 § Coin flip, #235). The Host tosses a coin that lands the same for every Member: the
// server picks the side, the toss starts a lead after the commit and lands after its duration. Pure, so the server enforces the
// rules and the client shows the same facts. Instants are epoch ms here; rows and the Event read give Dates and ISO strings, which
// the same rules take (ADR 0013: the instants come from Nuxt).

import { runningOf, type Instant, type SessionTimes } from './session-state'

/** The flight starts this long after the commit, so every client has the message first (the same reason as SPIN_LEAD_MS). */
export const COIN_LEAD_MS = 1500
/** How long the coin flies (04-motion § Coin: 3.6 s). The landing is the start plus this. */
export const COIN_DURATION_MS = 3600

/** What the rules need of a toss: when it starts and when it lands. */
export interface CoinToss {
  startedAt: Instant
  landsAt: Instant
}

const msOf = (at: Instant): number => (typeof at === 'number' ? at : new Date(at).getTime())

/** Whether the toss has landed at `nowMs`: from its landing instant on. */
export function coinLanded(toss: Pick<CoinToss, 'landsAt'>, nowMs: number): boolean {
  return msOf(toss.landsAt) <= nowMs
}

/** Why the Host cannot toss the coin now (#235): the Host asks, a Session is running, and the latest toss has landed. */
export type CoinRejection = 'not_host' | 'no_running_session' | 'coin_in_air'

export interface CoinInput {
  isHost: boolean
  sessions: readonly SessionTimes[]
  /** The Event's latest toss, or null before the first one: one coin at a time. */
  latest: CoinToss | null
  nowMs: number
}

/** The reason the coin cannot be tossed now, or null when it can, checked in the order of CoinRejection. */
export function coinRejection({ isHost, sessions, latest, nowMs }: CoinInput): CoinRejection | null {
  if (!isHost) return 'not_host'
  if (!runningOf(sessions)) return 'no_running_session'
  if (latest && !coinLanded(latest, nowMs)) return 'coin_in_air'
  return null
}
