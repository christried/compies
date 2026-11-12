import { describe, expect, it } from 'vitest'
import { bezier } from '~/utils/wheel'
import { cardPop, labelPop } from '~/utils/wheel-stop'

// The pops at the stop (#523, 04-motion § Lucky Wheel `stop`): the drawn label `scaleY 0 -> 1.25 -> 1` and the result card
// `scale .6 -> 1.08 -> 1` with its opacity, each 0.42 s on `EASE.pop` over the whole run, three keyframes at the eased progress 0, 0.5 and 1
// (the reference's Web Animation). The functions take the time since the stop and nothing else: the same on every device, a late joiner
// reads the end state with no replay.

/** `EASE.pop` (04-motion), written out here so the test does not borrow the code's copy. */
const POP = [0.34, 1.56, 0.64, 1] as const
const RUN = 420

/** The card's scale by the keyframes 0.6, 1.08, 1 at progress 0, 0.5, 1; the last segment runs on in a straight line past 1. */
const cardKeyframes = (p: number) => (p < 0.5 ? 0.6 + 0.48 * (p / 0.5) : 1.08 - 0.08 * ((p - 0.5) / 0.5))
/** The label's scaleY by the keyframes 0, 1.25, 1. */
const labelKeyframes = (p: number) => (p < 0.5 ? 1.25 * (p / 0.5) : 1.25 - 0.25 * ((p - 0.5) / 0.5))

/** The elapsed time at which the eased progress is 0.5, found by bisection (the ease rises through 0.5 once before it overshoots). */
function peakTime(): number {
  let low = 0
  let high = RUN / 2
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2
    if (bezier(POP, middle / RUN) < 0.5) low = middle
    else high = middle
  }
  return (low + high) / 2
}

describe('the pops at the stop, full motion', () => {
  it('starts at the keyframe values and is exactly at rest at 420 ms, not before', () => {
    expect(cardPop(0, false)).toEqual({ scale: 0.6, opacity: 0 })
    expect(labelPop(0, false)).toEqual({ scaleY: 0, opacity: 1 })
    expect(cardPop(RUN, false)).toEqual({ scale: 1, opacity: 1 })
    expect(labelPop(RUN, false)).toEqual({ scaleY: 1, opacity: 1 })
    expect(cardPop(RUN - 1, false).scale).not.toBe(1)
    expect(labelPop(RUN - 1, false).scaleY).not.toBe(1)
  })

  it('peaks where the eased progress is 0.5, about 54 ms in, and never goes higher', () => {
    const peak = peakTime()
    expect(peak).toBeGreaterThan(50)
    expect(peak).toBeLessThan(58)
    expect(cardPop(peak, false).scale).toBeCloseTo(1.08, 3)
    expect(labelPop(peak, false).scaleY).toBeCloseTo(1.25, 3)
    for (let ms = 0; ms <= RUN; ms++) {
      expect(cardPop(ms, false).scale).toBeLessThanOrEqual(1.08 + 1e-9)
      expect(labelPop(ms, false).scaleY).toBeLessThanOrEqual(1.25 + 1e-9)
    }
  })

  it('runs on EASE.pop over the whole 420 ms: the keyframes at the eased progress, with the overshoot dipping under 1', () => {
    for (const ms of [30, 100, 250]) {
      const p = bezier(POP, ms / RUN)
      expect(cardPop(ms, false).scale).toBeCloseTo(cardKeyframes(p), 6)
      expect(labelPop(ms, false).scaleY).toBeCloseTo(labelKeyframes(p), 6)
    }
    expect(cardPop(250, false).scale).toBeLessThan(1)
    expect(cardPop(250, false).scale).toBeGreaterThan(0.97)
    expect(labelPop(250, false).scaleY).toBeLessThan(1)
    expect(labelPop(250, false).scaleY).toBeGreaterThan(0.93)
  })

  it('clamps: before the stop the start values, long after it the end values', () => {
    expect(cardPop(-50, false)).toEqual({ scale: 0.6, opacity: 0 })
    expect(labelPop(-50, false)).toEqual({ scaleY: 0, opacity: 1 })
    expect(cardPop(9999, false)).toEqual({ scale: 1, opacity: 1 })
    expect(labelPop(9999, false)).toEqual({ scaleY: 1, opacity: 1 })
  })

  it('fades the card in by the peak and keeps it within 0 to 1; the label stays fully opaque', () => {
    expect(cardPop(0, false).opacity).toBe(0)
    expect(cardPop(peakTime(), false).opacity).toBeCloseTo(1, 6)
    expect(cardPop(RUN, false).opacity).toBe(1)
    for (let ms = 0; ms <= RUN; ms++) {
      expect(cardPop(ms, false).opacity).toBeGreaterThanOrEqual(0)
      expect(cardPop(ms, false).opacity).toBeLessThanOrEqual(1)
      expect(labelPop(ms, false).opacity).toBe(1)
    }
  })
})

describe('the pops at the stop, reduced motion', () => {
  it('has no scale at any time and crossfades the opacity over 200 ms', () => {
    for (let ms = -50; ms <= 600; ms += 10) {
      expect(cardPop(ms, true).scale).toBe(1)
      expect(labelPop(ms, true).scaleY).toBe(1)
    }
    expect(cardPop(0, true).opacity).toBe(0)
    expect(cardPop(100, true).opacity).toBeCloseTo(0.5, 6)
    expect(cardPop(200, true).opacity).toBe(1)
    expect(cardPop(300, true).opacity).toBe(1)
    expect(labelPop(0, true).opacity).toBe(0)
    expect(labelPop(100, true).opacity).toBeCloseTo(0.5, 6)
    expect(labelPop(200, true).opacity).toBe(1)
    expect(labelPop(-50, true).opacity).toBe(0)
  })
})
