import { describe, expect, it } from 'vitest'
import {
  CEREMONY_LEAD_MS,
  CEREMONY_RUN_MS,
  ceremonyEndsAt,
  ceremonyPlays,
  ceremonyRejection,
  ceremonyRunning,
  ceremonyTimeline,
  nextGag,
  type CeremonyGag,
} from '../../shared/ceremony'
import type { Phase } from '../../shared/phase'

// The Award ceremony's rules (#309, spec #308, 04-motion § 6b): the lead, the run's length per Party count and gag, when a run is
// over, and why the Host cannot start one now. Instants are epoch ms here; rows and the Event read give Dates and ISO strings.

const STARTS = 1_000_000
const ENDS = STARTS + 5050
const LATEST = { endsAt: ENDS }

describe('the timing (spec #308 § Shared ceremony rules)', () => {
  it('starts the run 1.5 s after the commit and fixes the run at 0.7 s', () => {
    expect(CEREMONY_LEAD_MS).toBe(1500)
    expect(CEREMONY_RUN_MS).toBe(700)
  })

  // Worked out from AwardCeremony.dc.html play(): 900 + 450 per row, the run, the gag (800 / 2200), the 2200 tail.
  const END_MS: Record<number, [number, number]> = {
    2: [5050, 6450],
    3: [5500, 6900],
    4: [5950, 7350],
    5: [6400, 7800],
    6: [6850, 8250],
    7: [7300, 8700],
    8: [7750, 9150],
  }

  for (const [parties, [trip, bonk]] of Object.entries(END_MS)) {
    it(`ends ${trip} ms (trip) and ${bonk} ms (bonk) after the start with ${parties} Parties`, () => {
      expect(ceremonyTimeline(Number(parties), 'trip').endMs).toBe(trip)
      expect(ceremonyTimeline(Number(parties), 'bonk').endMs).toBe(bonk)
    })
  }

  it('starts the run after the banner and the rows, and lands the gag after the run', () => {
    expect(ceremonyTimeline(2, 'trip')).toEqual({ runAtMs: 1350, landAtMs: 2850, endMs: 5050 })
    expect(ceremonyTimeline(2, 'bonk')).toEqual({ runAtMs: 1350, landAtMs: 4250, endMs: 6450 })
    expect(ceremonyTimeline(8, 'trip')).toEqual({ runAtMs: 4050, landAtMs: 5550, endMs: 7750 })
    expect(ceremonyTimeline(8, 'bonk')).toEqual({ runAtMs: 4050, landAtMs: 6950, endMs: 9150 })
  })

  it('has no row below two Parties', () => {
    expect(ceremonyTimeline(1, 'trip').runAtMs).toBe(900)
    expect(ceremonyTimeline(0, 'trip').runAtMs).toBe(900)
  })

  it('takes the start as epoch ms, a Date or an ISO string', () => {
    const expected = STARTS + 5050
    expect(ceremonyEndsAt(STARTS, 2, 'trip')).toBe(expected)
    expect(ceremonyEndsAt(new Date(STARTS), 2, 'trip')).toBe(expected)
    expect(ceremonyEndsAt(new Date(STARTS).toISOString(), 2, 'trip')).toBe(expected)
  })
})

describe('ceremonyRunning and ceremonyPlays', () => {
  it('runs until its end instant, the lead included', () => {
    expect(ceremonyRunning(LATEST, ENDS - 1)).toBe(true)
    expect(ceremonyRunning(LATEST, ENDS)).toBe(false)
    expect(ceremonyRunning(LATEST, STARTS - 1000)).toBe(true)
  })

  it('plays from its start instant to its end', () => {
    const c = { startsAt: STARTS, endsAt: ENDS }
    expect(ceremonyPlays(c, STARTS - 1)).toBe(false)
    expect(ceremonyPlays(c, STARTS)).toBe(true)
    expect(ceremonyPlays(c, ENDS - 1)).toBe(true)
    expect(ceremonyPlays(c, ENDS)).toBe(false)
  })
})

describe('ceremonyRejection', () => {
  const ok = { isHost: true, phase: 'finished' as Phase, latest: null, now: STARTS }

  it('lets the Host of a finished Event start the first run', () => {
    expect(ceremonyRejection(ok)).toBeNull()
  })

  it('checks in order: not_host, wrong_phase, ceremony_running', () => {
    expect(ceremonyRejection({ ...ok, isHost: false, phase: 'running', latest: LATEST, now: ENDS - 1 })).toBe('not_host')
    expect(ceremonyRejection({ ...ok, phase: 'running', latest: LATEST, now: ENDS - 1 })).toBe('wrong_phase')
    expect(ceremonyRejection({ ...ok, latest: LATEST, now: ENDS - 1 })).toBe('ceremony_running')
  })

  for (const phase of ['draft', 'poll', 'date_set', 'running', 'archived'] as const) {
    it(`refuses a ${phase} Event as wrong_phase`, () => {
      expect(ceremonyRejection({ ...ok, phase })).toBe('wrong_phase')
    })
  }

  it('allows a start exactly at the previous end, and refuses one a millisecond before', () => {
    expect(ceremonyRejection({ ...ok, latest: LATEST, now: ENDS - 1 })).toBe('ceremony_running')
    expect(ceremonyRejection({ ...ok, latest: LATEST, now: ENDS })).toBeNull()
  })

  it('takes the latest end as an ISO string', () => {
    const latest = { endsAt: new Date(ENDS).toISOString() }
    expect(ceremonyRejection({ ...ok, latest, now: ENDS - 1 })).toBe('ceremony_running')
    expect(ceremonyRejection({ ...ok, latest, now: new Date(ENDS) })).toBeNull()
  })
})

describe('nextGag', () => {
  it('asks the random source once with 2 for the first start', () => {
    const asked: number[] = []
    expect(nextGag(null, (n) => { asked.push(n); return 0 })).toBe('trip')
    expect(asked).toEqual([2])
    expect(nextGag(null, () => 1)).toBe('bonk')
  })

  it('takes the other gag on every later start without asking the source', () => {
    const never = (): number => { throw new Error('asked') }
    expect(nextGag('trip', never)).toBe<CeremonyGag>('bonk')
    expect(nextGag('bonk', never)).toBe<CeremonyGag>('trip')
  })
})
