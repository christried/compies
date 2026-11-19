import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMOTE_REDUCED_MS, EMOTE_RISE_MS, emoteRing, emoteRise } from '~/utils/motion'
import { EMOTE_COOLDOWN_MS } from '~~/shared/emote'
import { motion } from './motion'

// The Emote's rise and the bar's ring (#668, 04-motion § Emote rise: „0→.15 pop, .15→.8 climb, .8→1.4 fade; reduced: pop in place 0.2, hold 0.8, fade 0.3“).
// The offsets are fractions of the whole run, since the handoff's times are seconds. `Element.animate` is a stub that records each call.

const POP = 'cubic-bezier(.34,1.56,.64,1)'
const OUT = 'cubic-bezier(.16,1,.3,1)'

interface Call { keyframes: Keyframe[], options: KeyframeAnimationOptions }
let calls: Call[]
const realAnimate = Element.prototype.animate

beforeEach(() => {
  calls = []
  Element.prototype.animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ keyframes, options })
    return { finished: Promise.resolve(), cancel() {} }
  } as unknown as typeof Element.prototype.animate
})

afterEach(() => {
  Element.prototype.animate = realAnimate
  vi.restoreAllMocks()
})

describe('the rise of an Emote at full motion', () => {
  beforeEach(() => motion('full'))

  it('runs one animation of 1.4 s with four keyframes: pop, climb, fade', () => {
    emoteRise(document.createElement('img'))

    expect(calls).toHaveLength(1)
    const { keyframes, options } = calls[0]!
    expect(EMOTE_RISE_MS).toBe(1400)
    expect(options.duration).toBe(1400)
    expect(options.fill).toBe('both')
    expect(keyframes.map(frame => frame.offset)).toEqual([0, expect.closeTo(0.15 / 1.4, 6), expect.closeTo(0.8 / 1.4, 6), 1])
    expect(keyframes.map(frame => frame.transform)).toEqual([
      'translateY(10px) scale(.4)',
      'translateY(-6px) scale(1.15)',
      'translateY(-44px) scale(1)',
      'translateY(-64px) scale(1)',
    ])
    expect(keyframes.map(frame => frame.opacity)).toEqual([0, 1, 1, 0])
  })

  it('pops on --cp-ease-pop and climbs and fades on --cp-ease-out', () => {
    emoteRise(document.createElement('img'))

    const { keyframes } = calls[0]!
    expect(keyframes[0]!.easing).toBe(POP)
    expect(keyframes[1]!.easing).toBe(OUT)
    expect(keyframes[2]!.easing).toBe(OUT)
    expect(keyframes[3]!.easing).toBeUndefined()
  })

  it('does nothing where an element cannot animate', () => {
    Element.prototype.animate = undefined as unknown as typeof Element.prototype.animate

    expect(emoteRise(document.createElement('img'))).toBeUndefined()
  })
})

describe('the rise of an Emote under reduced motion', () => {
  beforeEach(() => motion('reduced'))

  it('pops in place for 0.2 s, holds 0.8 s and fades for 0.3 s', () => {
    emoteRise(document.createElement('img'))

    expect(calls).toHaveLength(1)
    const { keyframes, options } = calls[0]!
    expect(EMOTE_REDUCED_MS).toBe(1300)
    expect(options.duration).toBe(1300)
    expect(options.fill).toBe('both')
    expect(keyframes.map(frame => frame.offset)).toEqual([0, expect.closeTo(0.2 / 1.3, 6), expect.closeTo(1.0 / 1.3, 6), 1])
    expect(keyframes.map(frame => frame.transform)).toEqual(['scale(.8)', 'scale(1)', 'scale(1)', 'scale(1)'])
    expect(keyframes.map(frame => frame.opacity)).toEqual([0, 1, 1, 0])
  })

  it('stays at its place: no keyframe moves the picture', () => {
    emoteRise(document.createElement('img'))

    for (const frame of calls[0]!.keyframes) {
      expect(String(frame.transform)).not.toMatch(/translate/)
      expect(frame).not.toHaveProperty('translate')
    }
  })
})

describe('the ring of the Emote bar', () => {
  it.each(['full', 'reduced'] as const)('drains once over the wait, linear, with motion %s: it is information, not decoration', (setting) => {
    motion(setting)

    emoteRing(document.createElementNS('http://www.w3.org/2000/svg', 'circle'))

    expect(calls).toHaveLength(1)
    const { keyframes, options } = calls[0]!
    expect(keyframes).toEqual([{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }])
    expect(options.duration).toBe(EMOTE_COOLDOWN_MS)
    expect(options.easing).toBe('linear')
  })
})
