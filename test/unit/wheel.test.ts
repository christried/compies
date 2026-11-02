import { describe, expect, it } from 'vitest'
import { finalAngle, removalEase, revealStage, scramble, sliceSpans, wheelAngle, type WheelTiming } from '../../app/utils/wheel'
import { SPIN_REDUCED_MS } from '../../shared/rounds'

// The Lucky Wheel's angle toward a fixed stop instant (#229, 04-motion § Lucky Wheel, § Synchronised moments): a function of
// server time alone, so every device, a late joiner included, lands on the same angle at the same moment.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const spin: WheelTiming = { spinStartAt: START, stopAt: STOP, slices: 5, resultIndex: 3, resultOffset: 0.25 }

/** The wheel position (in slice units, from the top, clockwise) that the pointer at the top points at, for a rotation. */
const pointedAt = (angle: number, slices: number) => (((-angle % 360) + 360) % 360) / (360 / slices)

describe('wheelAngle', () => {
  it('stands at 0 until the spin starts', () => {
    expect(wheelAngle(spin, START - 1500, false)).toBe(0)
    expect(wheelAngle(spin, START, false)).toBe(0)
  })

  it('turns one way while it spins, further the later it is', () => {
    const samples = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map(share => wheelAngle(spin, START + 6000 * share, false))

    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeLessThan(samples[i - 1]!)
    expect(samples[0]!).toBeLessThan(0)
  })

  it('is far along by the middle: the curve starts fast', () => {
    expect(wheelAngle(spin, START + 3000, false)).toBeLessThan(finalAngle(spin) * 0.75)
  })

  it('ends at the final angle at the stop and stays there, with the pointer in the result slice at the offset', () => {
    const final = finalAngle(spin)

    expect(wheelAngle(spin, STOP, false)).toBeCloseTo(final, 6)
    expect(wheelAngle(spin, STOP + 30_000, false)).toBeCloseTo(final, 6)
    expect(pointedAt(final, 5)).toBeCloseTo(3.25, 6)
  })

  it('turns five full times past the target, so the spin is a spin', () => {
    expect(finalAngle(spin)).toBeCloseTo(-3.25 * 72 - 1800, 6)
  })

  it('is the same for every device that asks at the same server time', () => {
    expect(wheelAngle({ ...spin }, START + 2345, false)).toBe(wheelAngle(spin, START + 2345, false))
  })

  describe('under reduced motion', () => {
    it('stands still until the last 1.2 s, then lands on the same final angle at the same stop', () => {
      expect(wheelAngle(spin, STOP - SPIN_REDUCED_MS - 1, true)).toBe(0)
      expect(wheelAngle(spin, STOP - SPIN_REDUCED_MS / 2, true)).toBeLessThan(0)
      expect(wheelAngle(spin, STOP - SPIN_REDUCED_MS / 2, true)).toBeGreaterThan(finalAngle(spin))
      expect(wheelAngle(spin, STOP, true)).toBeCloseTo(finalAngle(spin), 6)
      expect(wheelAngle(spin, STOP + 5000, true)).toBeCloseTo(finalAngle(spin), 6)
    })
  })
})

describe('the removal of the drawn slice', () => {
  it('starts 2.2 s after the stop on a visible wheel and 2.8 s after on a Hidden one, and takes 0.6 s', () => {
    expect(removalEase(spin, STOP + 2200, false, false)).toBe(0)
    expect(removalEase(spin, STOP + 2500, false, false)).toBeGreaterThan(0)
    expect(removalEase(spin, STOP + 2500, false, false)).toBeLessThan(1)
    expect(removalEase(spin, STOP + 2800, false, false)).toBe(1)

    expect(removalEase(spin, STOP + 2800, true, false)).toBe(0)
    expect(removalEase(spin, STOP + 3400, true, false)).toBe(1)
  })

  it('jumps to done after a fade under reduced motion', () => {
    expect(removalEase(spin, STOP + 2200, false, true)).toBe(0)
    expect(removalEase(spin, STOP + 2200 + 199, false, true)).toBe(0)
    expect(removalEase(spin, STOP + 2200 + 200, false, true)).toBe(1)
  })
})

describe('the reveal of a Hidden wheel', () => {
  it('keeps the placeholder until half a second after the stop, then morphs for 0.3 s, then shows the game', () => {
    expect(revealStage(spin, STOP, false)).toEqual({ stage: 'placeholder', progress: 0 })
    expect(revealStage(spin, STOP + 499, false)).toEqual({ stage: 'placeholder', progress: 0 })
    expect(revealStage(spin, STOP + 650, false)).toEqual({ stage: 'morph', progress: 0.5 })
    expect(revealStage(spin, STOP + 800, false)).toEqual({ stage: 'real', progress: 1 })
  })

  it('crossfades for 0.2 s under reduced motion', () => {
    expect(revealStage(spin, STOP + 600, true)).toEqual({ stage: 'morph', progress: 0.5 })
    expect(revealStage(spin, STOP + 700, true)).toEqual({ stage: 'real', progress: 1 })
  })
})

describe('scramble', () => {
  it('turns a name into random letters of the same length, spaces kept, a new set for every frame', () => {
    const a = scramble('Super Smash Bratwurst', 1)
    const b = scramble('Super Smash Bratwurst', 2)

    expect(a).toHaveLength('Super Smash Bratwurst'.length)
    expect([...a].map((char, index) => char === ' ' ? index : -1).filter(index => index >= 0)).toEqual([5, 11])
    expect(scramble('Super Smash Bratwurst', 1)).toBe(a)
    expect(b).not.toBe(a)
    expect(a).not.toBe('Super Smash Bratwurst')
  })
})

describe('sliceSpans', () => {
  it('lays n slices out evenly around the wheel before the removal', () => {
    expect(sliceSpans(4, 1, 0)).toEqual([{ start: 0, end: 90 }, { start: 90, end: 180 }, { start: 180, end: 270 }, { start: 270, end: 360 }])
  })

  it('closes the gap after the removal: the drawn slice has no span, the others share the circle', () => {
    const spans = sliceSpans(4, 1, 1)

    expect(spans[1]!.end - spans[1]!.start).toBeCloseTo(0, 6)
    expect(spans[0]).toEqual({ start: 0, end: 120 })
    expect(spans[2]!.start).toBeCloseTo(120, 6)
    expect(spans[3]!.end).toBeCloseTo(360, 6)
  })

  it('always fills the whole circle, halfway too', () => {
    const spans = sliceSpans(7, 3, 0.4)

    expect(spans[0]!.start).toBe(0)
    expect(spans[6]!.end).toBeCloseTo(360, 6)
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeCloseTo(spans[i - 1]!.end, 6)
  })
})
