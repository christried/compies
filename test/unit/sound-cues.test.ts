import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMOTE_IDS } from '~~/shared/emote'
import type { SpinView, VetoView } from '~~/shared/stage'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { groupInput } from './group-input'
import { pinCrossings } from '../../app/utils/wheel-pins'
import {
  ARRIVAL_LATE_MS, CUE_GROUPS, CUE_IDS, CUE_VOLUME, EMOTE_CUE, OTHERS_EMOTE_VOLUME, STAMP_GAP_MS, TICK_MIN_GAP_MS, countdownCuePlan, cueFilesOf, emoteCue, reachableGroups, revealedOnArrival, thinTicks, vetoArrivalCues, vetoCuePlan, wheelCuePlan,
  type ArrivalCue, type CountdownCueInput, type Cue, type CueGroup, type CueId, type GroupInput, type VetoArrivalState, type VetoCueInput, type WheelCueInput,
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

// The Countdown's plan (#958, spec #961 § Countdown sounds): the end of a Veto window's sound at the Countdown's zero, from the same offsets. The
// end is the running Countdown's start plus the time it was started with; a ready or paused one plans nothing.
describe('countdownCuePlan', () => {
  const running = (remainingMs: number, startMs = 0): CountdownCueInput => ({ countdown: { startedAt: iso(START + startMs), remainingMs }, reducedMotion: false })
  const endCuesOfWindow = (endMs: number, reducedMotion = false) =>
    vetoCuePlan({ draw: drawOf(endMs), clip: null, reducedMotion }).filter(cue => cue.id !== 'veto-open')

  it('gives a running Countdown of 60 s the Veto window\'s fifteen ticks, its drumroll and its reveal, at the same offsets from its zero', () => {
    const cues = countdownCuePlan(running(60_000))

    expect(cues).toEqual(endCuesOfWindow(60_000))
    expect(at(cues).at(-1)).toEqual(['veto-reveal', 60_000])
    expect(offsets(cues, 'veto-drumroll')).toEqual([58_800])
    expect(offsets(cues, 'veto-clock')).toEqual([50_000, 51_000, 52_000, 53_000, 54_000, 55_000, 55_500, 56_000, 56_500, 57_000, 57_500, 58_000, 58_500, 59_000, 59_500])
  })

  it('leaves out the drumroll under reduced motion, and changes nothing else', () => {
    const cues = countdownCuePlan({ ...running(60_000), reducedMotion: true })

    expect(cues).toEqual(countdownCuePlan(running(60_000)).filter(cue => cue.id !== 'veto-drumroll'))
    expect(cues).toEqual(endCuesOfWindow(60_000, true))
  })

  it('plans nothing without a Countdown, for a ready one and for a paused one', () => {
    expect(countdownCuePlan({ countdown: null, reducedMotion: false })).toEqual([])
    expect(countdownCuePlan({ countdown: { startedAt: null, remainingMs: 60_000 }, reducedMotion: false })).toEqual([])
    expect(countdownCuePlan({ countdown: { startedAt: null, remainingMs: 4000 }, reducedMotion: false })).toEqual([])
  })

  it('plans from a resume with 4 s left only what is at or after the resume: the end from the resume plus the time left', () => {
    const cues = countdownCuePlan(running(4000, 30_000))

    expect(at(cues)).toEqual([
      ...[30_000, 30_500, 31_000, 31_500, 32_000, 32_500].map(offset => ['veto-clock', offset]),
      ['veto-drumroll', 32_800],
      ['veto-clock', 33_000],
      ['veto-clock', 33_500],
      ['veto-reveal', 34_000],
    ])
  })

  it('keeps a tick on the start of a 5 s Countdown and drops the one a millisecond before it', () => {
    expect(offsets(countdownCuePlan(running(5000)), 'veto-clock')).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500])
    expect(offsets(countdownCuePlan(running(4999)), 'veto-clock')).toEqual([-1 + 500, -1 + 1000, -1 + 1500, -1 + 2000, -1 + 2500, -1 + 3000, -1 + 3500, -1 + 4000, -1 + 4500])
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

// The reveal's condition, shared by the stamps and the header's reaction (#673): the count of Vetoes that arrived revealed, 0 for none.
describe('revealedOnArrival', () => {
  const state = (rest: Partial<VetoArrivalState> = {}): VetoArrivalState => ({ draw: drawOf(40_000), ownCast: false, revealedCount: null, ...rest })
  const afterEnd = START + 40_000 + 300

  it('is the count of a reveal that arrives on the same draw', () => {
    expect(revealedOnArrival(state(), state({ revealedCount: 1 }), afterEnd)).toBe(1)
    expect(revealedOnArrival(state(), state({ revealedCount: 2 }), afterEnd)).toBe(2)
  })

  it('is 0 for a window that ended with no Veto', () => {
    expect(revealedOnArrival(state(), state({ revealedCount: 0 }), afterEnd)).toBe(0)
  })

  it('is 0 on the first read, however much it shows, and without a window', () => {
    expect(revealedOnArrival(null, state({ revealedCount: 2 }), afterEnd)).toBe(0)
    expect(revealedOnArrival(state(), state({ draw: null, revealedCount: 2 }), afterEnd)).toBe(0)
  })

  it('is 0 for a read that already carried the reveal, read again', () => {
    expect(revealedOnArrival(state({ revealedCount: 2 }), state({ revealedCount: 2 }), afterEnd)).toBe(0)
  })

  it('is 0 for another draw, and when the end is not known', () => {
    expect(revealedOnArrival(state(), state({ revealedCount: 1, draw: { ...drawOf(40_000), drawId: 'd2' } }), afterEnd)).toBe(0)
    expect(revealedOnArrival(state(), state({ revealedCount: 1, draw: drawOf(null) }), afterEnd)).toBe(0)
  })

  it('is the count 2000 ms after the end, 0 at 2001', () => {
    expect(revealedOnArrival(state(), state({ revealedCount: 1 }), START + 40_000 + 2000)).toBe(1)
    expect(revealedOnArrival(state(), state({ revealedCount: 1 }), START + 40_000 + 2001)).toBe(0)
  })
})

// The Emote's cue (#770, spec #719 § C): a pure rule of the message's own fields and the server's now; Ton is the player's gate, not this rule's.
describe('emoteCue', () => {
  const NOW = START
  const heard = (over: Partial<Parameters<typeof emoteCue>[0]> = {}) => emoteCue({ emote: 'clap', sound: true, own: false, serverTime: NOW, now: NOW, ...over })

  it.each([
    ['clap', 'emo-clap'], ['tears', 'emo-haha'], ['angry', 'emo-grr'], ['roar', 'emo-roar'],
  ] as const)('maps %s to %s', (emote, id) => {
    expect(heard({ emote })).toEqual({ id, volume: OTHERS_EMOTE_VOLUME })
  })

  it('has a cue for every Emote, each its own', () => {
    expect(Object.keys(EMOTE_CUE).sort()).toEqual([...EMOTE_IDS].sort())
    expect(new Set(Object.values(EMOTE_CUE)).size).toBe(EMOTE_IDS.length)
  })

  it('plays the own Emote at full volume and another Member\'s at 60 %', () => {
    expect(heard({ own: true })!.volume).toBe(1)
    expect(heard({ own: false })!.volume).toBe(0.6)
  })

  it('is silent when the room marked the Emote without a sound, the own one too', () => {
    expect(heard({ sound: false })).toBeNull()
    expect(heard({ sound: false, own: true })).toBeNull()
  })

  it('plays an Emote exactly 2000 ms old, not one 2001 ms old, and one stamped ahead of now', () => {
    expect(heard({ serverTime: NOW - ARRIVAL_LATE_MS })).not.toBeNull()
    expect(heard({ serverTime: NOW - ARRIVAL_LATE_MS - 1 })).toBeNull()
    expect(heard({ serverTime: NOW + 5000 })).not.toBeNull()
  })
})

describe('the cue ids and their volumes', () => {
  it('are distinct ids', () => {
    expect(new Set(CUE_IDS).size).toBe(CUE_IDS.length)
  })

  it('give each cue the Vol of compibert-sound.md', () => {
    const doc = readFileSync(resolve(import.meta.dirname, '../../docs/design_handoff_compies/reference/docs/compibert-sound.md'), 'utf8')
    const vol: Record<string, number> = {}
    for (const row of doc.split('\n')) {
      const cells = row.split('|').map(cell => cell.trim())
      const id = cells.map(cell => /^`([a-z-]+)`$/.exec(cell)?.[1]).find(found => found && (CUE_IDS as readonly string[]).includes(found))
      if (id) vol[id] = Number(cells.at(-2))
    }

    const documented = CUE_IDS.filter(id => CUE_LENGTHS[id].docRow)
    expect(Object.keys(vol).sort()).toEqual([...documented].sort())
    for (const id of documented) expect(CUE_VOLUME[id], id).toBe(vol[id])
  })

  // The one place where a Vol (and a length) is a number in a test: the cues the document has no clean row for (`docRow: false` of CUE_LENGTHS), which the
  // test above cannot read. Their Vol is the spec table of #718 (`cer-trip` and `cer-bonk` share a document row; `cer-run` has none; the three voice cues
  // share one cell). `cb-laugh` has a length of its own there; `cer-run`'s is the run's, held in test/unit/ceremony-cues.test.ts. #748 may move any of them.
  it('gives the cues without a clean document row the Vol of the spec table, and only those', () => {
    const SPEC: Partial<Record<CueId, { vol: number, ms?: number }>> = {
      'cb-hype': { vol: 40 }, 'cb-gulp': { vol: 40 }, 'cb-yay': { vol: 40 },
      'cer-run': { vol: 40 }, 'cer-trip': { vol: 60 }, 'cer-bonk': { vol: 60 },
      'cb-laugh': { vol: 40, ms: 500 },
    }

    expect(Object.keys(SPEC).sort()).toEqual(CUE_IDS.filter(id => !CUE_LENGTHS[id].docRow).sort())
    for (const [id, spec] of Object.entries(SPEC) as [CueId, { vol: number, ms?: number }][]) {
      expect(CUE_VOLUME[id], id).toBe(spec.vol)
      if (spec.ms !== undefined) expect(CUE_LENGTHS[id].ms, id).toBe(spec.ms)
    }
  })
})

// Which cue files an Event read can need (#740): the group rule is a pure function of the flags of the viewer's own read, so a later moment adds a
// field and a row of this table, never a list in the composable. It is the one place that tests the rule: the per-moment test files test their own
// plan and files (#829).
describe('reachableGroups', () => {
  /** A group's place in the order of the `CueGroup` union, which `reachableGroups` returns ascending. A new group is a compile error until it has one. */
  const PLACE: Record<CueGroup, number> = { wheel: 0, veto: 1, coin: 2, standings: 3, board: 4, ceremony: 5, tour: 6, emote: 7, countdown: 8 }

  /** Each case is a read with its flags and the groups it reaches: every group has one row where only its own flag is on. */
  const ROWS: [name: string, over: Partial<GroupInput>, reached: CueGroup[]][] = [
    ['no flag', {}, []],
    ['a wheel', { wheel: true }, ['wheel']],
    ['a wheel and a Veto allowance', { wheel: true, vetoAllowance: 2 }, ['wheel', 'veto']],
    ['a wheel and a Veto window, without an allowance', { wheel: true, vetoWindow: true }, ['wheel', 'veto']],
    ['a running Session', { sessionRunning: true }, ['coin']],
    ['a toss in the read', { toss: true }, ['coin']],
    ['the Standings\' flag', { standings: true }, ['standings']],
    ['the Game board\'s flag', { board: true }, ['board']],
    ['a finished Event', { finished: true }, ['ceremony']],
    ['the Tour\'s flag', { tour: true }, ['tour']],
    ['the Emote\'s flag', { emote: true }, ['emote']],
    ['a Countdown in the read', { countdown: true }, ['countdown']],
  ]

  it.each(ROWS)('reaches exactly the right groups with %s', (_name, over, reached) => {
    expect(reachableGroups(groupInput(over))).toEqual(reached)
  })

  it('has a row for every group', () => {
    expect(new Set(ROWS.flatMap(([, , reached]) => reached))).toEqual(new Set(Object.keys(PLACE)))
  })

  it('reaches no Veto group without a wheel, whatever the allowance and the window say', () => {
    expect(reachableGroups(groupInput({ vetoAllowance: 2, vetoWindow: true }))).toEqual([])
  })

  it('returns every group, in the order of the union, once, with every flag on', () => {
    const all = reachableGroups(groupInput({ wheel: true, vetoAllowance: 2, vetoWindow: true, sessionRunning: true, toss: true, standings: true, board: true, emote: true, finished: true, tour: true, countdown: true }))

    expect(all).toEqual(Object.keys(PLACE).sort((a, b) => PLACE[a as CueGroup] - PLACE[b as CueGroup]))
  })

  it('does not compile with a field missing: every field of the input is required (#829)', () => {
    // @ts-expect-error `tour` is missing
    const missing: GroupInput = { wheel: true, vetoAllowance: 0, vetoWindow: false, sessionRunning: false, toss: false, standings: false, board: false, finished: false }

    expect(reachableGroups(missing)).toEqual(['wheel'])
  })
})

// Secrecy (CODING_STANDARDS § Secrecy): the group rule decides which files a page requests, so its input may carry no game, label, side or instant.
describe('the input of the group rule (Secrecy)', () => {
  /**
   * What each field of `GroupInput` may carry: a flag, or the one count. A field added to the type is a compile error here until somebody decides
   * which of the two it is, and a field that is neither (a game, a label, a side, an instant) has no row it could take.
   */
  const KIND = {
    wheel: 'flag', vetoAllowance: 'count', vetoWindow: 'flag', sessionRunning: 'flag', toss: 'flag', standings: 'flag', board: 'flag', emote: 'flag', finished: 'flag', tour: 'flag', countdown: 'flag',
  } satisfies Record<keyof GroupInput, 'flag' | 'count'>

  it('holds only flags and one count, and every field of the type has a row', () => {
    const input = groupInput()

    expect(Object.keys(input).sort()).toEqual(Object.keys(KIND).sort())
    for (const [field, value] of Object.entries(input)) expect(typeof value, field).toBe(KIND[field as keyof GroupInput] === 'flag' ? 'boolean' : 'number')
  })

  // The types let no read's game, side or label into a `GroupInput`; the variable carries them past the excess-property check, as a read does, so the
  // rule is shown to look at none of them.
  it.each([
    ['a wheel', { wheel: true }],
    ['a wheel with a Veto window', { wheel: true, vetoWindow: true }],
    ['a toss and a finished Event', { toss: true, finished: true }],
  ])('reaches the same groups for two reads that differ only in the drawn game, the side and a label: %s', (_name, over) => {
    const one = { ...groupInput(over), game: 'Halo', side: 'heads', label: 'Kopf' }
    const other = { ...groupInput(over), game: 'Kart', side: 'tails', label: 'Zahl' }

    expect(reachableGroups(one)).toEqual(reachableGroups(other))
    expect(reachableGroups(one)).toEqual(reachableGroups(groupInput(over)))
  })
})

describe('cueFilesOf', () => {
  it('is the five wheel cues and Compibert\'s three voice cues for the wheel\'s group', () => {
    expect(cueFilesOf(['wheel'])).toEqual(['wheel-windup', 'wheel-tick', 'wheel-stop', 'wheel-morph', 'wheel-slice-out', 'cb-hype', 'cb-gulp', 'cb-yay'])
  })

  it('is every cue, in the order of CUE_IDS and each once, for both groups', () => {
    const both = CUE_IDS.filter(id => CUE_GROUPS[id].includes('wheel') || CUE_GROUPS[id].includes('veto'))
    expect(cueFilesOf(['wheel', 'veto'])).toEqual(both)
    expect(cueFilesOf(['veto', 'wheel'])).toEqual(both)
  })

  it('is the four Emote cues in the order of CUE_IDS for the Emote\'s group, each only there (#770)', () => {
    expect(cueFilesOf(['emote'])).toEqual(['emo-clap', 'emo-haha', 'emo-grr', 'emo-roar'])
    for (const id of cueFilesOf(['emote'])) expect(CUE_GROUPS[id]).toEqual(['emote'])
  })

  it('is the Veto window\'s end cues for the Countdown\'s group, with no new file (#958)', () => {
    expect(cueFilesOf(['countdown'])).toEqual(['veto-clock', 'veto-drumroll', 'veto-reveal'])
    for (const id of cueFilesOf(['countdown'])) expect(CUE_GROUPS[id]).toEqual(['veto', 'countdown'])
  })

  it('is empty for no group', () => {
    expect(cueFilesOf([])).toEqual([])
  })
})
