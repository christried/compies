import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SpinView } from '~~/shared/stage'
import { pinCrossings } from '../../app/utils/wheel-pins'
import { CUE_IDS, CUE_VOLUME, TICK_MIN_GAP_MS, thinTicks, wheelCuePlan, type Cue, type WheelCueInput } from '../../app/utils/sound-cues'

// The wheel's cue plan (#530, spec #504 § The cue plan): which sound cue is due at which server time for a spin, as a pure function of the
// viewer's own Event read. Nothing here plays; the cue player (#531) schedules what the plan holds.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()
const spinOf = (ms: number, slices: number, resultIndex: number, resultOffset: number) => ({
  spinStartAt: iso(START), stopAt: iso(START + ms), slices, resultIndex, resultOffset,
})
const timingOf = (spin: ReturnType<typeof spinOf>) => ({
  spinStartAt: Date.parse(spin.spinStartAt), stopAt: Date.parse(spin.stopAt), slices: spin.slices, resultIndex: spin.resultIndex, resultOffset: spin.resultOffset,
})

const A = spinOf(6000, 5, 3, 0.25)
const B = spinOf(10_000, 5, 3, 0.25)
const D = spinOf(6000, 30, 0, 0.2)
const E = spinOf(10_000, 30, 17, 0.5)
const F = spinOf(6000, 1, 0, 0.5)
const G = spinOf(6000, 2, 1, 0.5)

const MEMBER: Omit<WheelCueInput, 'spin'> = { hiddenWheel: false, isHost: false, reducedMotion: false }
const plan = (spin: WheelCueInput['spin'], rest: Omit<WheelCueInput, 'spin'> = MEMBER) => wheelCuePlan({ spin, ...rest })
const ids = (cues: Cue[]) => cues.map(cue => cue.id)
const offsets = (cues: Cue[], id: Cue['id']) => cues.filter(cue => cue.id === id).map(cue => cue.at - START)
const ticksOf = (spin: ReturnType<typeof spinOf>) => offsets(plan(spin), 'wheel-tick')

describe('wheelCuePlan, a Member on a visible wheel', () => {
  it('gives spin A the wind-up, 28 ticks, the stop and the slice leaving, in order', () => {
    const cues = plan(A)

    expect(cues).toHaveLength(31)
    expect(ids(cues)).toEqual(['wheel-windup', ...Array.from({ length: 28 }, () => 'wheel-tick'), 'wheel-stop', 'wheel-slice-out'])
    expect(offsets(cues, 'wheel-windup')).toEqual([0])
    const ticks = offsets(cues, 'wheel-tick')
    expect(ticks[0]).toBeCloseTo(42.7, 0)
    expect(ticks.at(-1)).toBeCloseTo(4099.9, 0)
    expect(offsets(cues, 'wheel-stop')).toEqual([6000])
    expect(offsets(cues, 'wheel-slice-out')).toEqual([8200])
    expect(offsets(cues, 'wheel-morph')).toEqual([])
  })

  it('gives spin B the wind-up, 43 ticks, the stop at 10 s and the slice leaving at 12.2 s', () => {
    const cues = plan(B)

    expect(ids(cues)).toEqual(['wheel-windup', ...Array.from({ length: 43 }, () => 'wheel-tick'), 'wheel-stop', 'wheel-slice-out'])
    const ticks = offsets(cues, 'wheel-tick')
    expect(ticks[0]).toBeCloseTo(46.4, 0)
    expect(ticks.at(-1)).toBeCloseTo(7090.7, 0)
    expect(offsets(cues, 'wheel-stop')).toEqual([10_000])
    expect(offsets(cues, 'wheel-slice-out')).toEqual([12_200])
  })

  it('has nothing for a wheel that has not spun yet', () => {
    expect(plan(null)).toEqual([])
  })
})

describe('wheelCuePlan under a Hidden wheel', () => {
  it('gives a Member the morph half a second after the stop and the slice leaving later, at 2.8 s', () => {
    const cues = plan(A, { hiddenWheel: true, isHost: false, reducedMotion: false })

    expect(offsets(cues, 'wheel-morph')).toEqual([6500])
    expect(offsets(cues, 'wheel-slice-out')).toEqual([8800])
    expect(ids(cues).slice(-3)).toEqual(['wheel-stop', 'wheel-morph', 'wheel-slice-out'])
  })

  it('gives the Host no morph, because the Host sees the real names, but the same later slice leaving', () => {
    const cues = plan(A, { hiddenWheel: true, isHost: true, reducedMotion: false })

    expect(offsets(cues, 'wheel-morph')).toEqual([])
    expect(offsets(cues, 'wheel-slice-out')).toEqual([8800])
  })

  it('gives a Host on a visible wheel no morph and the slice leaving at 2.2 s', () => {
    const cues = plan(A, { hiddenWheel: false, isHost: true, reducedMotion: false })

    expect(offsets(cues, 'wheel-morph')).toEqual([])
    expect(offsets(cues, 'wheel-slice-out')).toEqual([8200])
  })
})

describe('the ticks are the pin crossings', () => {
  it.each([['A', A], ['B', B]])('are exactly the crossings of spin %s, none thinned', (_name, spin) => {
    expect(ticksOf(spin).map(at => at + START)).toEqual(pinCrossings(timingOf(spin)).map(crossing => crossing.at))
  })

  it('ends on the crossing back in E, so a pin crossed back sounds too', () => {
    const back = pinCrossings(timingOf(E)).filter(crossing => crossing.back).at(-1)!

    expect(back.at - START).toBeCloseTo(9479.6, 0)
    expect(ticksOf(E).at(-1)).toBeCloseTo(9479.6, 0)
  })

  it.each([['A', A], ['B', B], ['D', D], ['E', E]])('fall strictly between the wind-up and the stop in spin %s', (_name, spin) => {
    const length = Date.parse(spin.stopAt) - START
    for (const at of ticksOf(spin)) {
      expect(at).toBeGreaterThan(0)
      expect(at).toBeLessThan(length)
    }
  })
})

describe('the ticks\' cap', () => {
  it.each([['D', D, 150, 63, 8.0, 4553.1], ['E', E, 259, 107, 7.8, 9479.6]])(
    'thins the fast wheel %s from %i crossings to %i ticks, keeping the first and the last crossing',
    (_name, spin, crossings, ticks, first, last) => {
      const all = pinCrossings(timingOf(spin)).map(crossing => crossing.at)
      const sounded = ticksOf(spin).map(at => at + START)

      expect(all).toHaveLength(crossings)
      expect(sounded).toHaveLength(ticks)
      expect(sounded[0]! - START).toBeCloseTo(first, 0)
      expect(sounded.at(-1)! - START).toBeCloseTo(last, 0)
      expect(sounded[0]).toBe(all[0])
      expect(sounded.at(-1)).toBe(all.at(-1))
    },
  )

  it.each([['A', A], ['B', B], ['D', D], ['E', E]])('keeps every gap in spin %s at the cap or more, and only times of crossings', (_name, spin) => {
    const all = new Set(pinCrossings(timingOf(spin)).map(crossing => crossing.at))
    const sounded = ticksOf(spin).map(at => at + START)

    sounded.forEach((at, index) => {
      expect(all.has(at)).toBe(true)
      if (index > 0) expect(at - sounded[index - 1]!).toBeGreaterThanOrEqual(TICK_MIN_GAP_MS)
    })
  })

  it('keeps a tick exactly the cap after the last kept one, drops one below it, and counts from the last kept tick', () => {
    expect(thinTicks([0, 39, 40, 79, 80], 40)).toEqual([0, 40, 80])
  })

  it('has nothing to thin for no crossing and keeps a single one', () => {
    expect(thinTicks([], 40)).toEqual([])
    expect(thinTicks([5], 40)).toEqual([5])
  })
})

describe('wheelCuePlan under reduced motion', () => {
  it('leaves out the wind-up and the ticks and keeps the stop and the slice leaving', () => {
    const cues = plan(A, { hiddenWheel: false, isHost: false, reducedMotion: true })

    expect(ids(cues)).toEqual(['wheel-stop', 'wheel-slice-out'])
    expect(offsets(cues, 'wheel-stop')).toEqual([6000])
    expect(offsets(cues, 'wheel-slice-out')).toEqual([8200])
  })

  it('keeps the morph for a Hidden wheel\'s Member, at the same instants', () => {
    const cues = plan(A, { hiddenWheel: true, isHost: false, reducedMotion: true })

    expect(ids(cues)).toEqual(['wheel-stop', 'wheel-morph', 'wheel-slice-out'])
    expect(cues.map(cue => cue.at - START)).toEqual([6000, 6500, 8800])
  })
})

describe('wheelCuePlan, edges', () => {
  it.each([['F', F, 5], ['G', G, 11]])('gives spin %s its %i ticks between the wind-up and the stop at 6000', (_name, spin, ticks) => {
    const cues = plan(spin)

    expect(ids(cues)[0]).toBe('wheel-windup')
    expect(offsets(cues, 'wheel-tick')).toHaveLength(ticks)
    expect(offsets(cues, 'wheel-stop')).toEqual([6000])
  })

  it('gives a wheel without slices the wind-up and the stop but no tick', () => {
    const cues = plan({ ...A, slices: 0 })

    expect(ids(cues)).toEqual(['wheel-windup', 'wheel-stop', 'wheel-slice-out'])
  })

  it.each([['A', A], ['B', B], ['D', D], ['E', E], ['F', F], ['G', G]])('never repeats or reorders a time in spin %s', (_name, spin) => {
    const at = plan(spin, { hiddenWheel: true, isHost: false, reducedMotion: false }).map(cue => cue.at)

    at.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThan(at[index - 1]!)
    })
  })
})

describe('wheelCuePlan keeps the drawn game secret', () => {
  const view = (spin: ReturnType<typeof spinOf>): SpinView => ({ ...spin, roundId: 'r1', drawId: 'd1', labels: null, game: null, current: true })
  const known: SpinView = {
    ...view(A),
    roundId: 'r2',
    drawId: 'd2',
    labels: ['Halo', 'x', 'y', 'z', 'w'],
    game: { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null },
    current: false,
  }
  const unknown: SpinView = { ...known, labels: ['???', 'x', 'y', 'z', 'w'], game: null, drawId: 'd1', roundId: 'r1', current: true }
  const stop = START + 6000

  describe.each([
    ['a Member under a Hidden wheel', { hiddenWheel: true, isHost: false }],
    ['the Host under a Hidden wheel', { hiddenWheel: true, isHost: true }],
    ['a Member on a visible wheel', { hiddenWheel: false, isHost: false }],
    ['the Host on a visible wheel', { hiddenWheel: false, isHost: true }],
  ])('for %s', (_who, viewer) => {
    it.each([false, true])('is the same for two spins that differ only in the drawn game (reduced motion %s)', (reducedMotion) => {
      const withGame = plan(known, { ...viewer, reducedMotion })
      const without = plan(unknown, { ...viewer, reducedMotion })

      expect(withGame.filter(cue => cue.at <= stop)).toEqual(without.filter(cue => cue.at <= stop))
      expect(withGame).toEqual(without)
      expect(withGame.length).toBeGreaterThan(0)
    })
  })
})

describe('the cue ids and their volumes', () => {
  it('are eleven distinct ids', () => {
    expect(new Set(CUE_IDS).size).toBe(11)
  })

  it('give each cue the Vol of compibert-sound.md', () => {
    const doc = readFileSync(resolve(import.meta.dirname, '../../docs/design_handoff_compies/reference/docs/compibert-sound.md'), 'utf8')
    const vol: Record<string, number> = {}
    for (const row of doc.split('\n')) {
      const cells = row.split('|').map(cell => cell.trim())
      const id = cells.map(cell => /^`([a-z-]+)`$/.exec(cell)?.[1]).find(found => found && (CUE_IDS as readonly string[]).includes(found))
      if (id) vol[id] = Number(cells.at(-2))
    }

    expect(Object.keys(vol).sort()).toEqual([...CUE_IDS].sort())
    expect(CUE_VOLUME).toEqual(vol)
  })
})
