import { describe, expect, it } from 'vitest'
import { COIN_DURATION_MS, COIN_LEAD_MS, coinLanded, coinRejection, type CoinToss } from '../../shared/coin'
import type { SessionTimes } from '../../shared/session-state'

// The Coin flip's rules (#235, spec #218 § Coin flip, 04-motion § Coin): when a toss lands, and why the Host cannot toss now.
// Instants are epoch ms here; the database and the Event read give Dates and ISO strings, which the same rules take.

const STARTED = 1_000_000
const LANDS = STARTED + COIN_DURATION_MS
const TOSS: CoinToss = { startedAt: STARTED, landsAt: LANDS }
const RUNNING: SessionTimes[] = [{ startsAt: 0, startedAt: 0, endedAt: null }]
const NOT_STARTED: SessionTimes[] = [{ startsAt: 0, startedAt: null, endedAt: null }]
const ENDED: SessionTimes[] = [{ startsAt: 0, startedAt: 0, endedAt: 500 }]

describe('the timing (spec #218 § Coin flip, 04-motion § Coin)', () => {
  it('starts the flight 1.5 s after the commit and lasts 3.6 s', () => {
    expect(COIN_LEAD_MS).toBe(1500)
    expect(COIN_DURATION_MS).toBe(3600)
  })
})

describe('coinLanded', () => {
  it('has not landed before its landing instant', () => {
    expect(coinLanded(TOSS, LANDS - 1)).toBe(false)
  })

  it('has landed from its landing instant on', () => {
    expect(coinLanded(TOSS, LANDS)).toBe(true)
    expect(coinLanded(TOSS, LANDS + 60_000)).toBe(true)
  })

  it('takes ISO strings and Dates as the database and the Event read give them', () => {
    const iso = { startedAt: new Date(STARTED).toISOString(), landsAt: new Date(LANDS).toISOString() }
    expect(coinLanded(iso, LANDS - 1)).toBe(false)
    expect(coinLanded(iso, LANDS)).toBe(true)
  })
})

describe('coinRejection', () => {
  const host = { isHost: true, sessions: RUNNING, latest: null, nowMs: STARTED }

  it('lets the Host toss in a running Session when no toss flies', () => {
    expect(coinRejection(host)).toBeNull()
  })

  it('refuses a Member with not_host', () => {
    expect(coinRejection({ ...host, isHost: false })).toBe('not_host')
  })

  it('refuses without a running Session with no_running_session', () => {
    expect(coinRejection({ ...host, sessions: NOT_STARTED })).toBe('no_running_session')
    expect(coinRejection({ ...host, sessions: ENDED })).toBe('no_running_session')
  })

  it('refuses while the latest toss has not landed with coin_in_air, and allows a new one once it has', () => {
    expect(coinRejection({ ...host, latest: TOSS, nowMs: LANDS - 1 })).toBe('coin_in_air')
    expect(coinRejection({ ...host, latest: TOSS, nowMs: LANDS })).toBeNull()
  })

  it('checks the reasons in their order: not_host, then no_running_session, then coin_in_air', () => {
    const flying = { latest: TOSS, nowMs: LANDS - 1 }
    expect(coinRejection({ isHost: false, sessions: NOT_STARTED, ...flying })).toBe('not_host')
    expect(coinRejection({ isHost: true, sessions: NOT_STARTED, ...flying })).toBe('no_running_session')
  })
})
