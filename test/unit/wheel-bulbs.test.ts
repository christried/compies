import { describe, expect, it } from 'vitest'
import { bulbsLit, nextBulbChange } from '../../app/utils/wheel-bulbs'
import { BULB_COUNT } from '../../app/utils/wheel-look'

// Which of the 24 bulbs are lit at a server time (#521, spec #503 § The motion): the rest blink, the chase while the wheel turns, the
// stop's flash. A pure function of the spin's two instants and the server's time: the numbers here are the ticket's (0.6 s at rest, every
// fourth bulb every 0.08 s, three flashes of 0.12 s), so a change of them is a decision, not a refactor.

const START = 60_000
const STOP = 67_000
const SPIN = { spinStartAt: START, stopAt: STOP }

/** The indexes of the lit bulbs. */
const lit = (spin: typeof SPIN | null, now: number | null, reduced = false) => bulbsLit(spin, now, reduced).flatMap((on, index) => (on ? [index] : []))
const every = (from: number, step: number) => Array.from({ length: Math.ceil((BULB_COUNT - from) / step) }, (_, index) => from + index * step)
const EVEN = every(0, 2)
const ODD = every(1, 2)
const ALL = every(0, 1)

describe('at rest', () => {
  it('lights the even bulbs before the page has a clock, with or without a spin', () => {
    expect(lit(null, null)).toEqual(EVEN)
    expect(lit(SPIN, null)).toEqual(EVEN)
  })

  it('alternates the even and the odd bulbs every 0.6 s of the server time', () => {
    expect(lit(null, 0)).toEqual(EVEN)
    expect(lit(null, 599)).toEqual(EVEN)
    expect(lit(null, 600)).toEqual(ODD)
    expect(lit(null, 1199)).toEqual(ODD)
    expect(lit(null, 1200)).toEqual(EVEN)
  })

  it('gives two instants 0.6 s apart the two complementary patterns, wherever the first one lies', () => {
    for (const t of [0, 1200, 123_456, 600_000_007]) {
      const first = bulbsLit(null, t, false)
      const second = bulbsLit(null, t + 600, false)
      second.forEach((on, index) => expect(on).toBe(!first[index]))
    }
    expect(lit(null, 123_456)).toEqual(ODD)
  })

  it('blinks through the lead before the spin starts, and at the start of the spin it chases', () => {
    expect(lit(SPIN, 58_800)).toEqual(EVEN)
    expect(lit(SPIN, 59_400)).toEqual(ODD)
    expect(lit(SPIN, 59_999)).toEqual(ODD)
    expect(lit(SPIN, 60_000)).toEqual([0, 4, 8, 12, 16, 20])
  })

  it('blinks again from 0.72 s after the stop on, however long ago the spin was', () => {
    expect(lit(SPIN, 67_720)).toEqual(EVEN)
    expect(lit(SPIN, 67_800)).toEqual(ODD)
    expect(lit(SPIN, 67_720 + 3_600_000)).toEqual(lit(null, 67_720 + 3_600_000))
  })

  it('treats a spin that lies wholly in the future, or wholly in the past, as rest around it', () => {
    expect(lit(SPIN, 10_000)).toEqual(lit(null, 10_000))
    expect(lit(SPIN, 10_700)).toEqual(lit(null, 10_700))
    expect(lit(SPIN, 100_000)).toEqual(lit(null, 100_000))
  })
})

describe('the chase while the wheel turns', () => {
  it('lights every fourth bulb and moves the set one bulb toward the lower indexes every 0.08 s', () => {
    expect(lit(SPIN, 60_000)).toEqual([0, 4, 8, 12, 16, 20])
    expect(lit(SPIN, 60_079)).toEqual([0, 4, 8, 12, 16, 20])
    expect(lit(SPIN, 60_080)).toEqual([3, 7, 11, 15, 19, 23])
    expect(lit(SPIN, 60_160)).toEqual([2, 6, 10, 14, 18, 22])
    expect(lit(SPIN, 60_240)).toEqual([1, 5, 9, 13, 17, 21])
    expect(lit(SPIN, 60_320)).toEqual([0, 4, 8, 12, 16, 20])
  })

  it('runs to the last millisecond before the stop', () => {
    expect(lit(SPIN, 66_999)).toEqual([1, 5, 9, 13, 17, 21])
  })

  it('has no length of its own: it follows the stop of a longer spin', () => {
    const long = { spinStartAt: START, stopAt: START + 10_000 }
    expect(lit(long, 69_999)).toEqual([0, 4, 8, 12, 16, 20])
    expect(lit(long, 70_000)).toEqual(ALL)
  })

  it('differs by one step 0.08 s later and repeats after 0.32 s', () => {
    for (const t of [60_000, 61_234, 64_000]) {
      const now = bulbsLit(SPIN, t, false)
      const next = bulbsLit(SPIN, t + 80, false)
      // One step toward the lower indexes: the next frame's bulb i is this frame's bulb i + 1.
      next.forEach((on, index) => expect(on).toBe(now[(index + 1) % BULB_COUNT]))
      expect(bulbsLit(SPIN, t + 320, false)).toEqual(now)
    }
  })

  it.each([6000, 10_000])('lights exactly six bulbs, never two neighbours, at every millisecond of a spin of %i ms', (length) => {
    const spin = { spinStartAt: START, stopAt: START + length }
    for (let t = START; t < spin.stopAt; t++) {
      const bulbs = bulbsLit(spin, t, false)
      expect(bulbs.filter(Boolean)).toHaveLength(6)
      for (let i = 0; i < BULB_COUNT; i++) expect(bulbs[i] && bulbs[(i + 1) % BULB_COUNT]).toBe(false)
      expect(bulbs.some((on, i) => on && bulbs[(i + 4) % BULB_COUNT] === false)).toBe(false)
    }
  })
})

describe('the stop\'s flash', () => {
  it('flashes three times, lit for 0.12 s and dark for 0.12 s, starting lit at the stop', () => {
    expect(lit(SPIN, 66_999)).toHaveLength(6)
    const segments: [number, number[]][] = [[67_000, ALL], [67_119, ALL], [67_120, []], [67_239, []], [67_240, ALL], [67_359, ALL], [67_360, []], [67_479, []], [67_480, ALL], [67_599, ALL], [67_600, []], [67_719, []]]
    for (const [t, expected] of segments) expect(lit(SPIN, t), `at ${t}`).toEqual(expected)
  })

  it('is over at stop + 720 ms, and the blink goes on', () => {
    expect(lit(SPIN, 67_719)).toEqual([])
    expect(lit(SPIN, 67_720)).toEqual(EVEN)
  })
})

describe('reduced motion', () => {
  it('lights all 24 bulbs steadily: at rest, in the chase, at the stop, in the flash\'s dark half and with no clock', () => {
    for (const t of [0, 599, 600, 59_400, 60_000, 60_080, 66_999, 67_000, 67_120, 67_720, 67_800]) expect(lit(SPIN, t, true), `at ${t}`).toEqual(ALL)
    expect(lit(null, 600, true)).toEqual(ALL)
    expect(lit(null, null, true)).toEqual(ALL)
    expect(lit(SPIN, null, true)).toEqual(ALL)
  })
})

describe('a pure function of the time', () => {
  it('gives the same pattern for the same instant, whatever was asked before', () => {
    const instants = [59_000, 60_000, 60_080, 63_333, 66_999, 67_000, 67_120, 67_500, 67_720, 70_000]
    const forward = instants.map(t => bulbsLit(SPIN, t, false))
    const backward = [...instants].reverse().map(t => bulbsLit(SPIN, t, false)).reverse()
    expect(backward).toEqual(forward)
  })

  it('gives a device that joins mid-spin the pattern of one that watched', () => {
    const watched: boolean[][] = []
    for (let t = START; t <= START + 3000; t += 16) watched.push(bulbsLit(SPIN, t, false))
    expect(bulbsLit(SPIN, START + 3000 - (3000 % 16), false)).toEqual(watched.at(-1))
  })

  it('has 24 bulbs, the top one first, at every stage', () => {
    for (const t of [null, 0, 60_000, 67_000, 67_120, 67_720]) expect(bulbsLit(SPIN, t, false)).toHaveLength(24)
  })
})

describe('the next change of the pattern (#584 Q1)', () => {
  const next = (now: number) => nextBulbChange(SPIN, now)

  it('is the next rest boundary at rest, with or without a spin', () => {
    expect(nextBulbChange(null, 0)).toBe(600)
    expect(nextBulbChange(null, 599)).toBe(600)
    expect(nextBulbChange(null, 600)).toBe(1200)
    expect(nextBulbChange(null, 123_456)).toBe(123_600)
    expect(next(10_000)).toBe(10_200)
  })

  it('is the spin\'s start when that comes before the next rest boundary, during the lead', () => {
    // START = 60 000 is 100 times 600: a boundary itself, so the lead ends there at the same instant.
    expect(next(59_400)).toBe(START)
    expect(next(59_999)).toBe(START)
    const early = { spinStartAt: 60_250, stopAt: 66_250 }
    expect(nextBulbChange(early, 59_999)).toBe(60_000)
    expect(nextBulbChange(early, 60_000)).toBe(60_250)
    expect(nextBulbChange(early, 60_249)).toBe(60_250)
  })

  it('is the next step of the chase, 80 ms on, from the spin\'s start, and the stop when that comes first', () => {
    expect(next(START)).toBe(START + 80)
    expect(next(START + 79)).toBe(START + 80)
    expect(next(START + 80)).toBe(START + 160)
    expect(next(STOP - 1)).toBe(STOP)
    expect(nextBulbChange({ spinStartAt: START, stopAt: START + 50 }, START)).toBe(START + 50)
  })

  it('is the next step of the flash, 120 ms on, from the stop, and the end of the flash at 720 ms', () => {
    expect(next(STOP)).toBe(STOP + 120)
    expect(next(STOP + 119)).toBe(STOP + 120)
    expect(next(STOP + 600)).toBe(STOP + 720)
    expect(next(STOP + 719)).toBe(STOP + 720)
    // STOP + 720 = 67 720: the rest blink's next boundary is 67 800.
    expect(next(STOP + 720)).toBe(67_800)
  })

  it('knows nothing of the games: the same for a spin of any length and for the Host and a Member alike', () => {
    const long = { spinStartAt: START, stopAt: START + 10_000 }
    expect(nextBulbChange(long, START + 9999)).toBe(START + 10_000)
    expect(nextBulbChange(long, START + 10_000)).toBe(START + 10_120)
  })

  it.each([
    ['a spin of 6 s', SPIN],
    ['a spin of 10 s', { spinStartAt: START, stopAt: START + 10_000 }],
    ['no spin', null],
  ])('is always later than now, and the pattern is the same from one wake to the next, for %s', (_name, spin) => {
    const from = START - 2000
    const to = (spin?.stopAt ?? STOP) + 3000
    const wakes = [from]
    for (let w = nextBulbChange(spin, from); w <= to; w = nextBulbChange(spin, w)) wakes.push(w)

    for (let t = from; t <= to; t++) {
      expect(nextBulbChange(spin, t)).toBeGreaterThan(t)
      const wake = wakes.findLast(candidate => candidate <= t)!
      expect(bulbsLit(spin, t, false), `at ${t - START}`).toEqual(bulbsLit(spin, wake, false))
    }
  })

  it('wakes fewer than 110 times from 2 s before a spin of 6 s to 3 s after it, not once a frame', () => {
    let wakes = 0
    for (let w = START - 2000; w <= STOP + 3000; w = next(w)) wakes++
    expect(wakes).toBeLessThan(110)
  })
})
