import { describe, expect, it } from 'vitest'
import { bootRun, letterTimes } from '~/utils/boot-motion'

// The splash's run-in (#674, spec #927, 04-motion § Boot „Reinsprinten“): each letter springs up at the moment Compibert's snout passes it. The Lab's
// rule is `t = (letterCentreX − snoutStartX) / D × T`; the splash adds the upper clamp and a start distance that always lies outside the viewport.

const T = 0.9

describe('the time each letter springs up', () => {
  // The snout starts 100 px left of the layer and the run is 600 px long: 1 px of the snout's way is 1.5 ms.
  const times = (centres: number[]) => letterTimes(centres, -100, 600, T)

  it('is 0 for a letter that lies left of where the snout starts', () => {
    expect(times([-300, -100])).toEqual([0, 0])
  })

  it('is the way the snout has gone, in proportion, for a letter in between', () => {
    const [first, second, third] = times([200, 350, 500])
    expect(first).toBeCloseTo(0.45, 10)
    expect(second).toBeCloseTo(0.675, 10)
    expect(third).toBeCloseTo(0.9, 10)
  })

  it('is the run\'s length for a letter right of the snout\'s final place', () => {
    expect(times([500, 900, 5000])).toEqual([0.9, 0.9, 0.9])
  })

  it('keeps the order of the word: a letter further right never springs earlier', () => {
    const seen = times([20, 80, 140, 200, 260, 320, 380])
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
  })
})

describe('the run on a phone and on a desktop', () => {
  it('starts 620 px left on a 390 px layer, where he fits inside', () => {
    // The wrapper is 200 px wide at 174: its right edge, 374, is inside the 620.
    const { distance, times } = bootRun({ wrapperLeft: 174, wrapperWidth: 200, centres: [-1000, 30, 300, 2000] })

    expect(distance).toBe(620)
    // snoutStartX = 174 + 180 − 620 = −266.
    expect(times[0]).toBe(0)
    expect(times[1]).toBeCloseTo((30 + 266) / 620 * T, 10)
    expect(times[2]).toBeCloseTo((300 + 266) / 620 * T, 10)
    expect(times[3]).toBe(T)
  })

  it('starts further left on a 1280 px layer, so that he is outside the viewport at the start', () => {
    // The wrapper is 280 px wide at 900: its right edge, 1180, is beyond 620, so the run is 1180 px long.
    const { distance, times } = bootRun({ wrapperLeft: 900, wrapperWidth: 280, centres: [-500, 700, 1000, 1170] })

    expect(distance).toBe(1180)
    // snoutStartX = 900 + 252 − 1180 = −28.
    expect(times[0]).toBe(0)
    expect(times[1]).toBeCloseTo((700 + 28) / 1180 * T, 10)
    expect(times[2]).toBeCloseTo((1000 + 28) / 1180 * T, 10)
    expect(times[3]).toBe(T)
  })
})
