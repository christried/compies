import { describe, expect, it } from 'vitest'
import { finalAngle, wheelAngle, type WheelTiming } from '../../app/utils/wheel'
import { flapperKick, pinCrossings } from '../../app/utils/wheel-pins'

// The flapper's kicks (#522, spec #503 § The motion, 04-motion § Lucky Wheel): which pin passes the top when, worked out from the
// angle function itself, and the flapper's angle at a server time from those crossings. Pure functions of the spin and one clock value.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const spinOf = (ms: number, slices: number, resultIndex: number, resultOffset: number): WheelTiming => ({
  spinStartAt: START, stopAt: START + ms, slices, resultIndex, resultOffset,
})
/** How far the wheel ends up turned, in degrees (the angle falls from 0). */
const turnedAtStop = (spin: WheelTiming) => -finalAngle(spin)
const passed = (spin: WheelTiming) => Math.ceil(turnedAtStop(spin) / (360 / spin.slices)) - 1
/** The crossings' times in ms from the spin's start. */
const offsets = (spin: WheelTiming) => pinCrossings(spin).map(crossing => crossing.at - spin.spinStartAt)

const A = spinOf(6000, 5, 3, 0.25)
const B = spinOf(10_000, 5, 3, 0.25)
const C = spinOf(6000, 4, 2, 0.25)
const D = spinOf(6000, 30, 0, 0.2)
const E = spinOf(10_000, 30, 17, 0.5)
const F = spinOf(6000, 1, 0, 0.5)
const G = spinOf(6000, 2, 1, 0.5)

describe('pinCrossings', () => {
  it.each([
    ['A', A, 28], ['B', B, 43], ['C', C, 22], ['D', D, 150], ['F', F, 5], ['G', G, 11],
  ])('has one crossing for every pin passed in spin %s', (_name, spin, count) => {
    expect(pinCrossings(spin)).toHaveLength(count)
    expect(pinCrossings(spin)).toHaveLength(passed(spin))
  })

  it('has two more crossings than the pins passed in E: pin 18 lies between the final angle and the overshoot, so it is crossed forward and back', () => {
    const crossings = pinCrossings(E)

    expect(crossings).toHaveLength(259)
    expect(crossings).toHaveLength(passed(E) + 2)
    const eighteen = crossings.filter(crossing => crossing.pin === 18).slice(-2)
    expect(eighteen.map(crossing => crossing.at - START)).toEqual([expect.closeTo(8237.4, 0), expect.closeTo(9479.6, 0)])
    expect(eighteen.map(crossing => crossing.back)).toEqual([false, true])
  })

  it('marks no crossing as back where the wheel never turns back', () => {
    expect(pinCrossings(A).every(crossing => !crossing.back)).toBe(true)
  })

  it.each([A, B, C, D, E, F, G])('lists the crossings in order, inside the spin, first and last where they fall (%#)', (spin) => {
    const at = offsets(spin)

    expect(at.length).toBeGreaterThan(0)
    at.forEach((value, index) => {
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThan(spin.stopAt - spin.spinStartAt)
      if (index > 0) expect(value).toBeGreaterThan(at[index - 1]!)
    })
  })

  it('puts the first and the last crossing of each pinned spin where the angle function says', () => {
    expect(offsets(A)[0]).toBeCloseTo(42.7, 0)
    expect(offsets(A).at(-1)).toBeCloseTo(4099.9, 0)
    expect(pinCrossings(A)[0]!.pin).toBe(1)
    expect(pinCrossings(A).at(-1)!.pin).toBe(3)
    expect(offsets(B)[0]).toBeCloseTo(46.4, 0)
    expect(offsets(B).at(-1)).toBeCloseTo(7090.7, 0)
    expect(offsets(C)[0]).toBeCloseTo(54.3, 0)
    expect(offsets(C).at(-1)).toBeCloseTo(3996.3, 0)
    expect(offsets(D)[0]).toBeCloseTo(8.0, 0)
    expect(offsets(D).at(-1)).toBeCloseTo(4553.1, 0)
    expect(offsets(E).at(-1)).toBeCloseTo(9479.6, 0)
    expect(offsets(F)).toEqual([226.3, 486.1, 824.6, 1352.1, 2486.5].map(value => expect.closeTo(value, 0)))
    expect(offsets(G)[0]).toBeCloseTo(105.8, 0)
    expect(offsets(G).at(-1)).toBeCloseTo(3143.8, 0)
    expect(pinCrossings(G).slice(0, 4).map(crossing => crossing.pin)).toEqual([1, 0, 1, 0])
  })

  it.each([A, D, E])('puts every pin at the top where it says: the wheel has turned a whole number of shares there (%#)', (spin) => {
    const share = 360 / spin.slices

    for (const crossing of pinCrossings(spin)) {
      const turned = -wheelAngle(spin, crossing.at, false)
      expect(Math.abs(turned / share - Math.round(turned / share)) * share).toBeLessThan(0.01)
      expect(Math.round(turned / share) % spin.slices).toBe(crossing.pin)
    }
  })

  it.each([A, B, D, E])('thins out toward the stop: each forward gap is longer than the one before (%#)', (spin) => {
    const at = pinCrossings(spin).filter(crossing => !crossing.back).map(crossing => crossing.at)
    const gaps = at.slice(1).map((value, index) => value - at[index]!)

    // The overshoot's last pins come at the very end, so judge the run up to the peak, where the gaps are those of the ease.
    for (let index = 1; index < gaps.length - 2; index++) expect(gaps[index]!).toBeGreaterThan(gaps[index - 1]!)
  })

  it('has gaps of about 43 ms first and 970 ms last in A, the last over 20 times the first', () => {
    const at = offsets(A)

    expect(at[1]! - at[0]!).toBeCloseTo(43.2, 0)
    expect(at.at(-1)! - at.at(-2)!).toBeCloseTo(970.3, 0)
    expect(at.at(-1)! - at.at(-2)!).toBeGreaterThan(20 * (at[1]! - at[0]!))
  })

  it('differs only by the length between a 6 s and a 10 s spin: the same slices, more pins, each inside its own spin', () => {
    expect(pinCrossings(A)).toHaveLength(28)
    expect(pinCrossings(B)).toHaveLength(43)
    expect(offsets(A).at(-1)!).toBeLessThan(6000)
    expect(offsets(B).at(-1)!).toBeLessThan(10_000)
    expect(offsets(B).at(-1)!).toBeGreaterThan(6000)
  })

  it.each([7000, 8500])('counts the pins passed for a %i ms spin of A\'s slices', (ms) => {
    const spin = spinOf(ms, 5, 3, 0.25)

    expect(pinCrossings(spin)).toHaveLength(passed(spin))
    expect(offsets(spin).at(-1)!).toBeLessThan(ms)
  })

  describe('for every spin of a grid', () => {
    const cases = [1, 2, 3, 5, 9, 30].flatMap(slices => [6000, 7000, 8500, 10_000].flatMap(ms => (
      [[0, 0.2], [slices - 1, 0.799], [0, 0.5]] as const).map(([index, offset]) => spinOf(ms, slices, index, offset))))

    it.each(cases)('counts the pins passed or two more (a pin in the overshoot is crossed twice), in order and inside the spin (%#)', (spin) => {
      const crossings = pinCrossings(spin)
      const share = 360 / spin.slices

      expect([0, 2]).toContain(crossings.length - passed(spin))
      crossings.forEach((crossing, index) => {
        expect(crossing.at).toBeGreaterThan(spin.spinStartAt)
        expect(crossing.at).toBeLessThan(spin.stopAt)
        if (index > 0) expect(crossing.at).toBeGreaterThan(crossings[index - 1]!.at)
        const turned = -wheelAngle(spin, crossing.at, false)
        expect(Math.abs(turned / share - Math.round(turned / share)) * share).toBeLessThan(0.01)
      })
    })
  })

  it('has no crossing for a wheel of no slices or a spin that does not last', () => {
    expect(pinCrossings(spinOf(6000, 0, 0, 0))).toEqual([])
    expect(pinCrossings({ ...A, stopAt: A.spinStartAt })).toEqual([])
    expect(pinCrossings({ ...A, stopAt: A.spinStartAt - 1000 })).toEqual([])
  })

  it('gives a late joiner the same list: nothing of the clock goes in', () => {
    expect(pinCrossings({ ...A })).toEqual(pinCrossings(A))
  })
})

describe('flapperKick', () => {
  const crossingsA = pinCrossings(A)
  const T = crossingsA[27]!.at

  it('rests before the first crossing', () => {
    expect(flapperKick(crossingsA, crossingsA[0]!.at - 1, false)).toBe(0)
    expect(flapperKick(crossingsA, A.spinStartAt, false)).toBe(0)
  })

  it('rests with no crossing at all', () => {
    expect(flapperKick([], START, false)).toBe(0)
  })

  it('kicks to +30 at a crossing (positive: the tip to the left) and falls back by the snap curve over 0.13 s', () => {
    expect(flapperKick(crossingsA, T - 1, false)).toBe(0)
    expect(flapperKick(crossingsA, T, false)).toBe(30)
    expect(flapperKick(crossingsA, T + 32.5, false)).toBeCloseTo(11.7834, 3)
    expect(flapperKick(crossingsA, T + 65, false)).toBeCloseTo(3.665, 3)
    expect(flapperKick(crossingsA, T + 97.5, false)).toBeCloseTo(0.736, 3)
    expect(flapperKick(crossingsA, T + 130, false)).toBe(0)
    expect(flapperKick(crossingsA, T + 5000, false)).toBe(0)
  })

  it('falls monotonically from 30 to 0 and is never negative', () => {
    let previous = 30
    for (let since = 0; since < 130; since += 5) {
      const angle = flapperKick(crossingsA, T + since, false)
      expect(angle).toBeLessThanOrEqual(previous)
      expect(angle).toBeGreaterThanOrEqual(0)
      previous = angle
    }
  })

  describe('while pins come faster than a kick lasts', () => {
    const crossingsD = pinCrossings(D)

    it('stays up between close pins of D, and falls after the pin that follows a gap of 130 ms or more', () => {
      const [a, b] = [crossingsD[9]!.at, crossingsD[10]!.at]
      expect(flapperKick(crossingsD, (a + b) / 2, false)).toBe(30)

      const pin = crossingsD[143]!.at
      expect(pin - crossingsD[142]!.at).toBeLessThan(130)
      expect(crossingsD[144]!.at - pin).toBeGreaterThan(130)
      expect(flapperKick(crossingsD, pin - 0.01, false)).toBe(30)
      expect(flapperKick(crossingsD, pin, false)).toBe(30)
      expect(flapperKick(crossingsD, pin + 65, false)).toBeCloseTo(3.665, 3)
      expect(flapperKick(crossingsD, pin + 130, false)).toBe(0)
    })

    it('holds a kick up for a gap under 130 ms and lets one of exactly 130 ms fall', () => {
      expect(flapperKick([{ at: 0 }, { at: 129.9 }], 100, false)).toBe(30)
      expect(flapperKick([{ at: 0 }, { at: 130 }], 65, false)).toBeCloseTo(3.665, 3)
      expect(flapperKick([{ at: 0 }, { at: 130 }], 129.99, false)).toBeCloseTo(0, 1)
      expect(flapperKick([{ at: 0 }, { at: 130 }], 130, false)).toBe(30)
    })
  })

  it('does not kick under reduced motion, at any time', () => {
    expect(flapperKick(crossingsA, T, true)).toBe(0)
    expect(flapperKick(crossingsA, T + 20, true)).toBe(0)
    expect(flapperKick(crossingsA, A.spinStartAt, true)).toBe(0)
  })
})
