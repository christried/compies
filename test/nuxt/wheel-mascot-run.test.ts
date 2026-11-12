import { describe, expect, it } from 'vitest'
import { loadGsap } from '~/utils/gsap'
import { buildMascotTravel } from '~/utils/wheel-mascot-run'
import { ENTER_MS, FADE_REDUCED_MS, LEAVE_MS, mascotMoments, type MascotWidth } from '~/utils/wheel-mascot'

// Compibert's way in and out at the wheel (#526, 04-motion § Lucky Wheel · Compibert, CODING_STANDARDS § Motion, ADR 0015): the tweens of the
// built timeline carry the note's eases, durations and places, read off the timeline as `ceremony-run-tweens.test.ts` does, and the timeline
// put at a time gives the box's transform and opacity at that time (happy-dom has no layout, so this reads GSAP's inline values).

const START = Date.UTC(2090, 10, 7, 20, 0, 0)

interface Tween { targets: () => unknown[], startTime: () => number, vars: { ease?: unknown, duration?: number, x?: number, y?: number, opacity?: number } }

async function build({ length = 8000, hidden = false, reduced = false, width = 'md' }: { length?: number, hidden?: boolean, reduced?: boolean, width?: MascotWidth } = {}) {
  const gsap = await loadGsap()
  const element = document.createElement('div')
  document.body.append(element)
  const timeline = buildMascotTravel(gsap, element, { width, spin: { spinStartAt: START, stopAt: START + length }, hidden, reduced })
  const tweens = (timeline.getChildren(false, true, false) as unknown as Tween[]).map(tween => ({
    at: tween.startTime(),
    ease: typeof tween.vars.ease === 'string' ? tween.vars.ease : undefined,
    duration: tween.vars.duration!,
    moves: tween.vars.x !== undefined || tween.vars.y !== undefined,
    fades: tween.vars.opacity !== undefined,
    to: { x: tween.vars.x, y: tween.vars.y, opacity: tween.vars.opacity },
  }))
  /** The box's transform and opacity with the timeline at `seconds`. */
  const at = (seconds: number) => {
    timeline.time(seconds, false)
    return { x: Number(gsap.getProperty(element, 'x')), y: Number(gsap.getProperty(element, 'y')), opacity: Number(gsap.getProperty(element, 'opacity')) }
  }
  return { timeline, tweens, at, element }
}

const near = (value: number, wanted: number) => expect(value).toBeCloseTo(wanted, 5)

describe('the travel at md', () => {
  it('has the note\'s tweens: in along the radius 0.45 s with back.out(1.8), a 0.14 s fade in, out 0.4 s with power2.in, a 0.14 s fade out', async () => {
    const { tweens } = await build({ length: 8000 })
    const leave = (8000 + 2200) / 1000

    const enter = tweens.find(tween => tween.moves && tween.at === 0)
    expect(enter).toMatchObject({ ease: 'back.out(1.8)', duration: 0.45, to: { x: 0, y: 0 } })
    expect(tweens.find(tween => tween.fades && tween.at === 0)).toMatchObject({ ease: 'expo.out', duration: 0.14, to: { opacity: 1 } })
    expect(tweens.find(tween => tween.moves && tween.at === leave)).toMatchObject({ ease: 'power2.in', duration: 0.4, to: { x: -130, y: 100 } })
    const fadeOut = tweens.find(tween => tween.fades && tween.at > 0)!
    expect(fadeOut).toMatchObject({ ease: 'none', duration: 0.14, to: { opacity: 0 } })
    near(fadeOut.at, leave + 0.4 - 0.14)
    expect(tweens).toHaveLength(4)
  })

  it.each([6000, 10_000])('puts the way out at the removal start of a spin of %i ms, in its last 0.4 s', async (length) => {
    const { tweens, timeline } = await build({ length })
    const leave = (length + 2200) / 1000

    expect(tweens.find(tween => tween.moves && tween.at > 0)!.at).toBe(leave)
    near(timeline.duration(), leave + 0.4)
  })

  it('puts the way out of a Hidden wheel at the stop + 2.8 s', async () => {
    const { tweens, timeline } = await build({ length: 6000, hidden: true })

    expect(tweens.find(tween => tween.moves && tween.at > 0)!.at).toBe(8.8)
    near(timeline.duration(), 9.2)
  })

  it('stands behind the rim at the start, at rest after 0.45 s and at the removal start, and behind the rim and gone 0.4 s later', async () => {
    const { at } = await build({ length: 8000 })

    expect(at(0)).toEqual({ x: -130, y: 100, opacity: 0 })
    expect(at(0.14)).toMatchObject({ opacity: 1 })
    expect(at(0.45)).toEqual({ x: 0, y: 0, opacity: 1 })
    expect(at(5)).toEqual({ x: 0, y: 0, opacity: 1 })
    expect(at(10.2)).toEqual({ x: 0, y: 0, opacity: 1 })
    const half = at(10.4)
    expect(half.x).toBeLessThan(0)
    expect(half.x).toBeGreaterThan(-130)
    expect(at(10.6)).toEqual({ x: -130, y: 100, opacity: 0 })
  })

  it('overshoots on the way in (back.out), which a plain ease would not', async () => {
    const { at } = await build()
    const x = [0.1, 0.2, 0.3, 0.4].map(seconds => at(seconds).x)

    expect(Math.max(...x)).toBeGreaterThan(0)
  })

  it('lets a late joiner land on any time at once, in the same place as the one who watched', async () => {
    const watched = await build()
    const late = await build()
    const times = [0, 0.2, 0.45, 3, 10.2, 10.3, 10.5, 10.6]
    const seen = times.map(seconds => watched.at(seconds))

    // The late joiner's first read is the last one; the others follow in a shuffled order.
    expect(late.at(10.3)).toEqual(seen[5])
    expect(late.at(0.2)).toEqual(seen[1])
    expect(late.at(3)).toEqual(seen[3])
    expect(late.at(10.6)).toEqual(seen[7])
  })

  it('does not run on GSAP\'s ticker: it stands paused until it is moved', async () => {
    const { timeline } = await build()

    expect(timeline.paused()).toBe(true)
  })
})

// The phase (`mascotPhase`, in ms) and the tweens (in s) are two writings of one set of times: the tween that brings him in, and the one that takes him
// out, end where `mascotMoments` says he is there and gone (#584). The lengths are read off the tweens and compared with the phase's constants.
describe.each([['a spin', false], ['a Hidden spin', true]])('the tweens of %s join the phase\'s times', (_name, hidden) => {
  const spin = { spinStartAt: START, stopAt: START + 8000 }

  it('bring him in in ENTER_MS and take him out in LEAVE_MS, ending where he is gone', async () => {
    const { tweens } = await build({ length: 8000, hidden })
    const { goneAt } = mascotMoments(spin, hidden, false)
    const enter = tweens.find(tween => tween.moves && tween.at === 0)!
    const leave = tweens.find(tween => tween.moves && tween.at > 0)!

    near(enter.duration * 1000, ENTER_MS)
    near(leave.duration * 1000, LEAVE_MS)
    near(leave.at * 1000 + LEAVE_MS, goneAt - spin.spinStartAt)
  })

  it('fade in place in FADE_REDUCED_MS under reduced motion, ending where he is gone', async () => {
    const { tweens } = await build({ length: 8000, hidden, reduced: true })
    const { goneAt } = mascotMoments(spin, hidden, true)

    near(tweens[0]!.duration * 1000, FADE_REDUCED_MS)
    near(tweens[1]!.duration * 1000, FADE_REDUCED_MS)
    near(tweens[1]!.at * 1000 + FADE_REDUCED_MS, goneAt - spin.spinStartAt)
  })
})

describe('the travel at sm', () => {
  it('goes 100 left and 80 down, in the same times', async () => {
    const { at, tweens } = await build({ width: 'sm' })

    expect(at(0)).toEqual({ x: -100, y: 80, opacity: 0 })
    expect(at(0.45)).toEqual({ x: 0, y: 0, opacity: 1 })
    expect(at(10.6)).toEqual({ x: -100, y: 80, opacity: 0 })
    expect(tweens.find(tween => tween.moves && tween.at > 0)).toMatchObject({ ease: 'power2.in', duration: 0.4, to: { x: -100, y: 80 } })
  })
})

describe('the travel under reduced motion', () => {
  it('has no x and no y: he fades in 0.22 s at the start and out 0.22 s from the removal start', async () => {
    const { tweens, timeline } = await build({ length: 8000, reduced: true })

    expect(tweens.filter(tween => tween.moves)).toEqual([])
    expect(tweens).toHaveLength(2)
    expect(tweens[0]).toMatchObject({ at: 0, ease: 'expo.out', duration: 0.22, to: { opacity: 1 } })
    expect(tweens[1]).toMatchObject({ at: 10.2, ease: 'expo.in', duration: 0.22, to: { opacity: 0 } })
    near(timeline.duration(), 10.42)
  })

  it('never changes the box\'s place, whatever the time', async () => {
    const { at } = await build({ reduced: true, width: 'sm' })

    for (const seconds of [0, 0.1, 0.22, 4, 10.2, 10.3, 10.42, 20]) {
      const { x, y } = at(seconds)
      expect({ x, y }).toEqual({ x: 0, y: 0 })
    }
    expect(at(0).opacity).toBe(0)
    expect(at(0.22).opacity).toBe(1)
    expect(at(10.42).opacity).toBe(0)
  })

  it('puts the way out of a Hidden wheel at the stop + 2.8 s', async () => {
    const { tweens } = await build({ length: 6000, hidden: true, reduced: true })

    expect(tweens[1]!.at).toBe(8.8)
  })
})
