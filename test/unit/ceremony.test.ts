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
import { ceremonyLayout } from '../../app/utils/ceremony'
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
      expect(ceremonyTimeline({ partyCount: Number(parties), gag: 'trip', winners: 1 }).endMs).toBe(trip)
      expect(ceremonyTimeline({ partyCount: Number(parties), gag: 'bonk', winners: 1 }).endMs).toBe(bonk)
    })
  }

  it('starts the run after the banner and the rows, and lands the gag after the run', () => {
    expect(ceremonyTimeline({ partyCount: 2, gag: 'trip', winners: 1 })).toMatchObject({ runAtMs: 1350, landAtMs: 2850, endMs: 5050 })
    expect(ceremonyTimeline({ partyCount: 2, gag: 'bonk', winners: 1 })).toMatchObject({ runAtMs: 1350, landAtMs: 4250, endMs: 6450 })
    expect(ceremonyTimeline({ partyCount: 8, gag: 'trip', winners: 1 })).toMatchObject({ runAtMs: 4050, landAtMs: 5550, endMs: 7750 })
    expect(ceremonyTimeline({ partyCount: 8, gag: 'bonk', winners: 1 })).toMatchObject({ runAtMs: 4050, landAtMs: 6950, endMs: 9150 })
  })

  // The moments the Pokal-Lauf's tracks and the layer's flags hang on (#312), from AwardCeremony.dc.html play().
  it('puts the rows at 600 ms, the card after them, and the run ends 700 ms after its start', () => {
    expect(ceremonyTimeline({ partyCount: 2, gag: 'trip', winners: 1 })).toMatchObject({ rowsAtMs: 600, cardAtMs: 1050, runEndAtMs: 2050 })
    expect(ceremonyTimeline({ partyCount: 8, gag: 'bonk', winners: 1 })).toMatchObject({ rowsAtMs: 600, cardAtMs: 3750, runEndAtMs: 4750 })
  })

  it('stamps 150 ms after the landing, pops the people in at 450 ms and gets Compibert up at 300 ms', () => {
    expect(ceremonyTimeline({ partyCount: 2, gag: 'trip', winners: 1 })).toMatchObject({ stampAtMs: 3000, membersAtMs: 3300, getUpAtMs: 3150 })
    expect(ceremonyTimeline({ partyCount: 8, gag: 'bonk', winners: 1 })).toMatchObject({ stampAtMs: 7100, membersAtMs: 7400, getUpAtMs: 7250 })
  })

  // The end frame's buttons rise in 1.4 s after the landing (04-motion § 6b `share (+1.4)`, #314); the run's end is not moved by it.
  it('shows the share row 1400 ms after the landing, before the end, and leaves the end where it was', () => {
    for (const parties of [2, 8]) {
      for (const gag of ['trip', 'bonk'] as const) {
        const { shareAtMs, landAtMs, endMs } = ceremonyTimeline({ partyCount: parties, gag: gag, winners: 1 })
        expect(shareAtMs).toBe(landAtMs + 1400)
        expect(shareAtMs).toBeLessThan(endMs)
      }
    }
    expect(ceremonyTimeline({ partyCount: 2, gag: 'trip', winners: 1 })).toMatchObject({ shareAtMs: 4250, endMs: 5050 })
    expect(ceremonyTimeline({ partyCount: 8, gag: 'bonk', winners: 1 })).toMatchObject({ shareAtMs: 8350, endMs: 9150 })
  })

  it('has no row below two Parties', () => {
    expect(ceremonyTimeline({ partyCount: 1, gag: 'trip', winners: 1 }).runAtMs).toBe(900)
    expect(ceremonyTimeline({ partyCount: 0, gag: 'trip', winners: 1 }).runAtMs).toBe(900)
  })

  it('takes the start as epoch ms, a Date or an ISO string', () => {
    const expected = STARTS + 5050
    expect(ceremonyEndsAt(STARTS, { partyCount: 2, gag: 'trip', winners: 1 })).toBe(expected)
    expect(ceremonyEndsAt(new Date(STARTS), { partyCount: 2, gag: 'trip', winners: 1 })).toBe(expected)
    expect(ceremonyEndsAt(new Date(STARTS).toISOString(), { partyCount: 2, gag: 'trip', winners: 1 })).toBe(expected)
  })
})

// A Tie (#315, 04-motion § 6b-T, 12-siegerehrung-unentschieden.md): the run's length also depends on the Winner count k. Worked out from
// the design: the rows (k = 2) or chips (k >= 3) are fewer, each further Winner's card adds a hop of 540 ms, the plate comes 620 ms after the last
// landing, and everything after the landing hangs on the plate. A grid (the card sizes of a phone, k >= 4) lands on the plate at once.
describe('the timing of a Tie (#315)', () => {
  const END_MS_TIE: [parties: number, winners: number, trip: number, bonk: number][] = [
    [4, 2, 6660, 8060],
    [3, 3, 6300, 7700],
    [8, 8, 4600, 6000],
  ]
  for (const [parties, winners, trip, bonk] of END_MS_TIE) {
    it(`ends ${trip} ms (trip) and ${bonk} ms (bonk) with ${winners} Winners of ${parties} Parties`, () => {
      expect(ceremonyTimeline({ partyCount: parties, gag: 'trip', winners: winners }).endMs).toBe(trip)
      expect(ceremonyTimeline({ partyCount: parties, gag: 'bonk', winners: winners }).endMs).toBe(bonk)
    })
  }

  it('has no rows when every Party won: the plate and the cards come at 600 ms', () => {
    expect(ceremonyTimeline({ partyCount: 2, gag: 'trip', winners: 2 })).toMatchObject({ rowsAtMs: 600, cardAtMs: 600, runAtMs: 900 })
  })

  it('has 450 ms rows below 2 Winners and 200 ms chips below 3 or more', () => {
    // 4 Parties, 2 Winners: two rows (450 each). 5 Parties, 3 Winners: two chips (200 apart, the last 300 long). 8 Parties, 4 Winners: four.
    expect(ceremonyTimeline({ partyCount: 4, gag: 'trip', winners: 2 }).cardAtMs).toBe(1500)
    expect(ceremonyTimeline({ partyCount: 5, gag: 'trip', winners: 3 }).cardAtMs).toBe(1100)
    expect(ceremonyTimeline({ partyCount: 8, gag: 'trip', winners: 4 }).cardAtMs).toBe(1500)
  })

  it('hangs the plate on the last landing of the chain: 540 ms per further card, then 620 ms', () => {
    expect(ceremonyTimeline({ partyCount: 4, gag: 'trip', winners: 2 })).toMatchObject({ landAtMs: 3300, plateAtMs: 4460, stampAtMs: 4610, getUpAtMs: 4760, membersAtMs: 4910, endMs: 6660 })
    expect(ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3 })).toMatchObject({ landAtMs: 2400, plateAtMs: 4100 })
  })

  it('lands on the plate at once in a grid, and the plate is the landing for a single Winner', () => {
    expect(ceremonyTimeline({ partyCount: 8, gag: 'trip', winners: 8 })).toMatchObject({ landAtMs: 2400, plateAtMs: 2400, stampAtMs: 2550 })
    expect(ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3, grid: true })).toMatchObject({ landAtMs: 2400, plateAtMs: 2400 })
    for (const gag of ['trip', 'bonk'] as const) {
      const single = ceremonyTimeline({ partyCount: 5, gag: gag, winners: 1 })
      expect(single.plateAtMs).toBe(single.landAtMs)
    }
  })

  // The share row hangs on the plate in a Tie (12-siegerehrung-unentschieden.md: `share (plate +1.4)`), never on the first landing, or the buttons
  // would show before the plate has stamped.
  it('shows the share row 1400 ms after the plate and before the end, for 1, 2, 3 and 8 Winners with both gags', () => {
    for (const winners of [1, 2, 3, 8]) {
      for (const gag of ['trip', 'bonk'] as const) {
        const { shareAtMs, plateAtMs, endMs } = ceremonyTimeline({ partyCount: 8, gag: gag, winners: winners })
        expect(shareAtMs - plateAtMs, `${winners} ${gag}`).toBe(1400)
        expect(shareAtMs, `${winners} ${gag}`).toBeLessThan(endMs)
      }
    }
    expect(ceremonyTimeline({ partyCount: 4, gag: 'trip', winners: 2 }).shareAtMs).toBe(4460 + 1400)
  })

  it('takes a grid from 4 Winners on its own', () => {
    expect(ceremonyTimeline({ partyCount: 4, gag: 'trip', winners: 4 })).toEqual(ceremonyTimeline({ partyCount: 4, gag: 'trip', winners: 4, grid: true }))
    expect(ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3 })).toEqual(ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3, grid: false }))
  })

  // A phone shows 3 Winners as a grid, the server never knows the device and stores the chain's end: the phone is early, never late.
  for (const gag of ['trip', 'bonk'] as const) {
    it(`ends a grid no later than the stored end for every Winner count with the ${gag} gag`, () => {
      for (let winners = 2; winners <= 8; winners++) {
        for (let parties = winners; parties <= 8; parties++) {
          expect(ceremonyTimeline({ partyCount: parties, gag: gag, winners: winners, grid: true }).endMs, `${winners} of ${parties}`).toBeLessThanOrEqual(ceremonyTimeline({ partyCount: parties, gag: gag, winners: winners }).endMs)
        }
      }
    })
  }

  // The two homes of „grid or chain“ (#308 review): the server stores the end for `ceremonyTimeline`'s default, the client lays the stage out with
  // `ceremonyLayout`, which also grids 3 Winners on a phone. If they ever disagree the wrong way, a viewer's run ends after the stored end.
  for (const gag of ['trip', 'bonk'] as const) {
    it(`never ends the client's run after the stored end, for every Party and Winner count and both widths, with the ${gag} gag`, () => {
      for (let parties = 2; parties <= 8; parties++) {
        for (let winners = 1; winners <= parties; winners++) {
          for (const roomy of [true, false]) {
            const grid = ceremonyLayout(winners, parties - winners, roomy).stage === 'grid'
            expect(ceremonyTimeline({ partyCount: parties, gag: gag, winners: winners, grid: grid }).endMs, `${winners} of ${parties}, ${roomy ? 'wide' : 'phone'}`).toBeLessThanOrEqual(ceremonyEndsAt(0, { partyCount: parties, gag: gag, winners: winners }))
          }
        }
      }
    })
  }

  it('stores the chain\'s end for 3 Winners: a phone\'s grid is up to 1.7 s earlier', () => {
    expect(ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3 }).endMs - ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3, grid: true }).endMs).toBe(1700)
  })

  it('takes the Winner count into the end instant', () => {
    expect(ceremonyEndsAt(STARTS, { partyCount: 4, gag: 'trip', winners: 2 })).toBe(STARTS + 6660)
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
    const source = (n: number): number => {
      asked.push(n)
      return 0
    }
    expect(nextGag(null, source)).toBe('trip')
    expect(asked).toEqual([2])
    expect(nextGag(null, () => 1)).toBe('bonk')
  })

  it('takes the other gag on every later start without asking the source', () => {
    const never = (): number => {
      throw new Error('asked')
    }
    expect(nextGag('trip', never)).toBe<CeremonyGag>('bonk')
    expect(nextGag('bonk', never)).toBe<CeremonyGag>('trip')
  })
})
