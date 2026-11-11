import { describe, expect, it } from 'vitest'
import { sliceSpans } from '../../app/utils/wheel'
import { BULB_COUNT, bulbPoints, pinAngles, restBulbs, wheelPoint } from '../../app/utils/wheel-look'

// The Show-Rad's look as pure functions (#519, spec #503): where the pins and bulbs stand, and which bulbs are lit at rest. The pin
// positions are worked out here once: the flapper's kicks (#522) and the pin ticks of 0.13.3 read them from the same function.

describe('pinAngles', () => {
  it('has no pin on an empty wheel and one at the top for a single slice', () => {
    expect(pinAngles(sliceSpans(0, -1, 0))).toEqual([])
    expect(pinAngles(sliceSpans(1, -1, 0))).toEqual([0])
  })

  it('puts a pin at every slice edge of a resting wheel', () => {
    expect(pinAngles(sliceSpans(2, -1, 0))).toEqual([0, 180])
    for (const n of [9, 30]) {
      const pins = pinAngles(sliceSpans(n, -1, 0))
      expect(pins).toHaveLength(n)
      pins.forEach((pin, index) => expect(pin).toBeCloseTo((index * 360) / n, 9))
    }
  })

  it('drops the drawn slice\'s pin once its slice has closed, and leaves the others at their new starts', () => {
    expect(pinAngles(sliceSpans(4, 1, 0.5))).toHaveLength(4)

    const closed = pinAngles(sliceSpans(4, 1, 0.96))
    expect(closed).toHaveLength(3)
    // The slice after the drawn one starts where the drawn one starts, and the others are spread over 360 / 3 each.
    const spans = sliceSpans(4, 1, 0.96)
    expect(closed).toEqual([spans[0]!.start, spans[2]!.start, spans[3]!.start])
  })
})

describe('the bulbs', () => {
  it('has 24 bulbs at rest, every second one lit, the top one included', () => {
    const lit = restBulbs()
    expect(BULB_COUNT).toBe(24)
    expect(lit).toHaveLength(24)
    expect(lit.filter(Boolean)).toHaveLength(12)
    expect(lit[0]).toBe(true)
    lit.forEach((on, index) => expect(on).toBe(index % 2 === 0))
  })

  it('stands them on a ring of 190 around the centre, the first at the top and clockwise', () => {
    const points = bulbPoints()
    expect(points).toHaveLength(24)
    expect(points[0]!.x).toBeCloseTo(200, 9)
    expect(points[0]!.y).toBeCloseTo(10, 9)
    expect(points[6]!.x).toBeCloseTo(390, 9)
    expect(points[6]!.y).toBeCloseTo(200, 9)
  })
})

describe('wheelPoint', () => {
  it('is a point `degrees` clockwise from the top', () => {
    const point = wheelPoint(90, 100)
    expect(point.x).toBeCloseTo(300, 9)
    expect(point.y).toBeCloseTo(200, 9)
    expect(wheelPoint(0, 100)).toEqual({ x: 200, y: 100 })
  })
})
