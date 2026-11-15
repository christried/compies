import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SpinView, VetoView } from '~~/shared/stage'
import { pinCrossings } from '../../app/utils/wheel-pins'
import {
  ARRIVAL_LATE_MS, CUE_IDS, CUE_VOLUME, STAMP_GAP_MS, TICK_MIN_GAP_MS, thinTicks, vetoArrivalCues, vetoCuePlan, wheelCuePlan,
  type ArrivalCue, type Cue, type VetoArrivalState, type VetoCueInput, type WheelCueInput,
} from '../../app/utils/sound-cues'

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

// The Veto window's plan (#532): from the viewer's own read, S = the window's stop, E = its end. Offsets below are from S.
const CLOCK_OFFSETS_BEFORE_END = [10_000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 500]
const drawOf = (windowMs: number | null, kind: 'spin' | 'set' = 'spin'): NonNullable<VetoCueInput['draw']> => ({
  drawId: 'd1', kind, stopAt: iso(START), vetoEndsAt: windowMs === null ? null : iso(START + windowMs),
})
const clipOf = (endsMs: number, drawId = 'd1'): NonNullable<VetoCueInput['clip']> => ({ drawId, endsAt: iso(START + endsMs) })
const VETO: VetoCueInput = { draw: drawOf(40_000), clip: clipOf(10_000), reducedMotion: false }
const vetoPlan = (rest: Partial<VetoCueInput> = {}) => vetoCuePlan({ ...VETO, ...rest })
const at = (cues: Cue[]) => cues.map(cue => [cue.id, cue.at - START])

describe('vetoCuePlan, a window of 40 s with a Clip of 10 s', () => {
  it('gives the opening, the Clip\'s close, fifteen clock ticks, the drumroll and the reveal, in order', () => {
    const cues = vetoPlan()

    expect(cues).toHaveLength(19)
    expect(at(cues)).toEqual([
      ['veto-open', 0],
      ['veto-clip-close', 10_000],
      ...[30_000, 31_000, 32_000, 33_000, 34_000, 35_000, 35_500, 36_000, 36_500, 37_000, 37_500, 38_000, 38_500].map(offset => ['veto-clock', offset]),
      ['veto-drumroll', 38_800],
      ['veto-clock', 39_000],
      ['veto-clock', 39_500],
      ['veto-reveal', 40_000],
    ])
  })

  it('ticks five times at one a second and ten at two a second, none at the end itself', () => {
    const ticks = offsets(vetoPlan(), 'veto-clock')

    expect(ticks).toHaveLength(15)
    expect(ticks.filter(offset => offset < 35_000 + 1)).toEqual([30_000, 31_000, 32_000, 33_000, 34_000, 35_000])
    expect(ticks.slice(-9)).toEqual([35_500, 36_000, 36_500, 37_000, 37_500, 38_000, 38_500, 39_000, 39_500])
    expect(ticks).not.toContain(40_000)
  })
})

describe('vetoCuePlan, a window of 150 s with a Clip of 120 s', () => {
  it('has the same cues at the window\'s end and the Clip\'s close at 120 s', () => {
    const cues = vetoPlan({ draw: drawOf(150_000), clip: clipOf(120_000) })

    expect(cues).toHaveLength(19)
    expect(offsets(cues, 'veto-open')).toEqual([0])
    expect(offsets(cues, 'veto-clip-close')).toEqual([120_000])
    expect(offsets(cues, 'veto-clock')).toEqual(CLOCK_OFFSETS_BEFORE_END.map(before => 150_000 - before))
    expect(offsets(cues, 'veto-drumroll')).toEqual([148_800])
    expect(offsets(cues, 'veto-reveal')).toEqual([150_000])
  })
})

describe('vetoCuePlan, the Clip\'s close', () => {
  it('is absent with no Clip', () => {
    expect(offsets(vetoPlan({ clip: null }), 'veto-clip-close')).toEqual([])
  })

  it('is absent when the Clip belongs to another draw', () => {
    expect(offsets(vetoPlan({ clip: clipOf(10_000, 'd0') }), 'veto-clip-close')).toEqual([])
  })

  it('is at the window\'s end for a game without a video (a card of 30 s)', () => {
    const cues = vetoPlan({ draw: drawOf(30_000), clip: clipOf(30_000) })

    expect(offsets(cues, 'veto-clip-close')).toEqual([30_000])
    expect(offsets(cues, 'veto-reveal')).toEqual([30_000])
  })
})

describe('vetoCuePlan, a set game', () => {
  it('has no opening of its own (it is an arrival cue), the rest as a spin\'s window', () => {
    const cues = vetoPlan({ draw: drawOf(40_000, 'set') })

    expect(cues).toHaveLength(18)
    expect(offsets(cues, 'veto-open')).toEqual([])
    expect(offsets(cues, 'veto-reveal')).toEqual([40_000])
    expect(offsets(cues, 'veto-clip-close')).toEqual([10_000])
  })
})

describe('vetoCuePlan, a moved end', () => {
  it('is the plan of the read that follows the Clip\'s skip: the new clock, drumroll and reveal, no close, and none of the old end\'s', () => {
    const unmoved = vetoPlan()
    const moved = vetoPlan({ draw: drawOf(35_000), clip: null })

    expect(offsets(moved, 'veto-clock')).toEqual(CLOCK_OFFSETS_BEFORE_END.map(before => 35_000 - before))
    expect(offsets(moved, 'veto-clock')[0]).toBe(25_000)
    expect(offsets(moved, 'veto-clock').at(-1)).toBe(34_500)
    expect(offsets(moved, 'veto-drumroll')).toEqual([33_800])
    expect(offsets(moved, 'veto-reveal')).toEqual([35_000])
    expect(offsets(moved, 'veto-clip-close')).toEqual([])
    // The old plan's ticks of 30 s to 34.5 s are the new plan's too (the player keeps them); every other instant of the old end is gone.
    const kept = new Set(offsets(moved, 'veto-clock'))
    for (const cue of unmoved.filter(cue => cue.id === 'veto-drumroll' || cue.id === 'veto-reveal' || cue.id === 'veto-clip-close')) {
      expect(moved.some(other => other.id === cue.id && other.at === cue.at), `${cue.id}@${cue.at - START}`).toBe(false)
    }
    expect(offsets(unmoved, 'veto-clock').filter(offset => !kept.has(offset))).toEqual([35_000, 35_500, 36_000, 36_500, 37_000, 37_500, 38_000, 38_500, 39_000, 39_500])
  })
})

describe('vetoCuePlan under reduced motion', () => {
  it('leaves out the drumroll, the reveal\'s hit is the one hit, and changes nothing else', () => {
    const normal = vetoPlan()
    const reduced = vetoPlan({ reducedMotion: true })

    expect(reduced).toEqual(normal.filter(cue => cue.id !== 'veto-drumroll'))
    expect(offsets(reduced, 'veto-drumroll')).toEqual([])
    expect(offsets(reduced, 'veto-reveal')).toEqual([40_000])
    expect(offsets(reduced, 'veto-clock')).toHaveLength(15)
  })
})

describe('vetoCuePlan, no window and a window not yet ended', () => {
  it('has nothing for a Draw without a window, whatever else is given', () => {
    expect(vetoPlan({ draw: null })).toEqual([])
    expect(vetoPlan({ draw: null, clip: clipOf(10_000) })).toEqual([])
  })

  it('gives a Member before the stop only the opening of a spin: the end is not known yet', () => {
    const cues = vetoPlan({ draw: drawOf(null), clip: null })

    expect(at(cues)).toEqual([['veto-open', 0]])
  })

  it('gives a set game before its end nothing', () => {
    expect(vetoPlan({ draw: drawOf(null, 'set'), clip: null })).toEqual([])
  })
})

describe('vetoCuePlan, a window shorter than its cues (the code makes none)', () => {
  it('plans no clock tick before the stop, the rest as offsets allow', () => {
    const cues = vetoPlan({ draw: drawOf(8000), clip: null })

    expect(offsets(cues, 'veto-clock')).toEqual([0, 1000, 2000, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500])
    expect(offsets(cues, 'veto-drumroll')).toEqual([6800])
    expect(cues.every(cue => cue.at >= START)).toBe(true)
  })

  it('drops the drumroll too when the window is shorter than it', () => {
    const cues = vetoPlan({ draw: drawOf(1000), clip: null })

    expect(offsets(cues, 'veto-drumroll')).toEqual([])
    expect(offsets(cues, 'veto-reveal')).toEqual([1000])
  })
})

describe('vetoCuePlan keeps the Vetoes secret', () => {
  const sealed: VetoView = {
    left: [0, 0], own: { team: 1, cast: true, rejection: null }, revealed: [{ team: 1 }, { team: 2 }],
    draw: { ...drawOf(40_000), game: null },
  }

  it('never holds a veto-seal: the stamps are arrival cues, not planned', () => {
    for (const rest of [{}, { reducedMotion: true }, { draw: drawOf(40_000, 'set') }, { draw: drawOf(null) }]) {
      expect(ids(vetoPlan(rest))).not.toContain('veto-seal')
    }
  })

  it('is the same whatever else a whole Veto view holds: own, left, revealed and the game change nothing', () => {
    const { draw: _draw, ...others } = sealed
    const plain = vetoCuePlan(VETO)

    expect(vetoCuePlan({ ...VETO, ...others, game: { name: 'Halo' } } as unknown as VetoCueInput)).toEqual(plain)
    expect(vetoCuePlan({ ...VETO, own: null, left: [2, 2], revealed: null } as unknown as VetoCueInput)).toEqual(plain)
  })
})

// The arrival cues (#532): what the arrival of a read causes, not a time known ahead. A pure function of the page's previous and its new read.
describe('vetoArrivalCues', () => {
  const NOW = START + 1000
  const state = (rest: Partial<VetoArrivalState> = {}): VetoArrivalState => ({ draw: drawOf(40_000), ownCast: false, revealedCount: null, ...rest })
  const cues = (previous: VetoArrivalState | null, next: VetoArrivalState, now = NOW): ArrivalCue[] => vetoArrivalCues(previous, next, now)

  it('plays nothing on the page\'s first read, however much it shows', () => {
    expect(cues(null, state({ ownCast: true, revealedCount: 2, draw: drawOf(40_000, 'set') }), START + 40_000)).toEqual([])
  })

  it('plays nothing without a window', () => {
    expect(cues(state(), state({ draw: null }))).toEqual([])
    expect(cues(state({ draw: null }), state({ draw: null, ownCast: true }))).toEqual([])
  })

  describe('the own Party\'s cast', () => {
    it('is one veto-seal at once when the cast appears on the same draw', () => {
      expect(cues(state(), state({ ownCast: true }))).toEqual([{ id: 'veto-seal', delayMs: 0 }])
    })

    it('is not played again by a refetch that still shows the cast', () => {
      expect(cues(state({ ownCast: true }), state({ ownCast: true }))).toEqual([])
    })

    it('is not played for a new draw whose cast is already there', () => {
      const next = state({ ownCast: true, draw: { ...drawOf(40_000), drawId: 'd2' } })

      expect(cues(state(), next)).toEqual([])
    })

    it('is not played when no Party of the viewer cast: another Party\'s cast changes nothing the viewer\'s read holds', () => {
      // The viewer's own Party did not cast; the read hides every other Party's cast before the end (`left`, `revealed` are the same), so
      // the two states of that viewer are equal, whether or not another Party cast.
      const nobodyCast = state()
      const anotherPartyCast = state()

      expect(anotherPartyCast).toEqual(nobodyCast)
      expect(cues(nobodyCast, anotherPartyCast)).toEqual([])
    })
  })

  describe('the stamps', () => {
    const ended = (count: number | null) => state({ revealedCount: count })
    const afterEnd = START + 40_000 + 300

    it('are one veto-seal per Veto, the first at once and the next 80 ms apart', () => {
      expect(STAMP_GAP_MS).toBe(80)
      expect(cues(ended(null), ended(2), afterEnd)).toEqual([{ id: 'veto-seal', delayMs: 0 }, { id: 'veto-seal', delayMs: 80 }])
    })

    it('are eight at most: 0 to 560 ms', () => {
      expect(cues(ended(null), ended(8), afterEnd).map(cue => cue.delayMs)).toEqual([0, 80, 160, 240, 320, 400, 480, 560])
    })

    it('are none for a window that ended with no Veto', () => {
      expect(cues(ended(null), ended(0), afterEnd)).toEqual([])
    })

    it('are played when the reveal is read 2000 ms after the end, not 2001', () => {
      expect(ARRIVAL_LATE_MS).toBe(2000)
      expect(cues(ended(null), ended(1), START + 40_000 + 2000)).toHaveLength(1)
      expect(cues(ended(null), ended(1), START + 40_000 + 2001)).toEqual([])
    })

    it('are not played again by a refetch, or for a new draw whose reveal is already there', () => {
      expect(cues(ended(2), ended(2), afterEnd)).toEqual([])
      expect(cues(ended(null), state({ revealedCount: 2, draw: { ...drawOf(40_000), drawId: 'd2' } }), afterEnd)).toEqual([])
    })

    it('are not played when the end is not known', () => {
      expect(cues(ended(null), state({ revealedCount: 1, draw: drawOf(null) }), afterEnd)).toEqual([])
    })

    it('follow a cast that is seen only with the read after the end: the cast\'s seal first, then the stamps', () => {
      const previous = state()
      const next = state({ ownCast: true, revealedCount: 2 })

      expect(cues(previous, next, afterEnd)).toEqual([
        { id: 'veto-seal', delayMs: 0 }, { id: 'veto-seal', delayMs: 0 }, { id: 'veto-seal', delayMs: 80 },
      ])
    })
  })

  describe('the opening of a set game', () => {
    const set = (drawId = 'd1') => state({ draw: { ...drawOf(40_000, 'set'), drawId } })

    it('is one veto-open at once when its draw appears on a page that was open', () => {
      expect(cues(state({ draw: null }), set())).toEqual([{ id: 'veto-open', delayMs: 0 }])
      expect(cues(set('d0'), set('d1'))).toEqual([{ id: 'veto-open', delayMs: 0 }])
    })

    it('is not played again by a refetch of the same draw', () => {
      expect(cues(set(), set())).toEqual([])
    })

    it('is not played for a spin\'s draw: that opening is planned ahead', () => {
      expect(cues(state({ draw: null }), state())).toEqual([])
    })

    it('is not played when the set draw is more than 2000 ms old', () => {
      expect(cues(state({ draw: null }), set(), START + 2000)).toHaveLength(1)
      expect(cues(state({ draw: null }), set(), START + 2001)).toEqual([])
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
