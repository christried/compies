import { describe, expect, it } from 'vitest'
import { COUNT_TICK_MS, countAt } from '../../app/utils/count-up'

// The count-up of a number in the Standings (#276, 04-motion § Leaderboard: 0.6 s power2.out, at most 15 changes a second).

describe('countAt', () => {
  it('starts on `from` and ends on `to`', () => {
    expect(countAt(3, 8, 0, 600)).toBe(3)
    expect(countAt(3, 8, 600, 600)).toBe(8)
  })

  it('stays on `to` after the end', () => {
    expect(countAt(3, 8, 601, 600)).toBe(8)
    expect(countAt(3, 8, 60_000, 600)).toBe(8)
  })

  it('follows power2.out: at half the time it has done 75 % of the way', () => {
    expect(countAt(0, 100, 300, 600)).toBe(75)
    expect(countAt(10, 50, 300, 600)).toBe(40)
  })

  it('rounds to a whole number', () => {
    // 1 − (1 − 1/3)² = 5/9 of 9 = 5
    expect(countAt(0, 9, 200, 600)).toBe(5)
    expect(Number.isInteger(countAt(0, 7, 123, 600))).toBe(true)
  })

  it('counts down after a Correction lowers a number', () => {
    expect(countAt(8, 3, 0, 600)).toBe(8)
    expect(countAt(8, 3, 300, 600)).toBe(4)
    expect(countAt(8, 3, 600, 600)).toBe(3)
  })

  it('shows the number at once when there is nothing to count', () => {
    expect(countAt(5, 5, 0, 600)).toBe(5)
    expect(countAt(5, 5, 300, 600)).toBe(5)
    expect(countAt(0, 0, 100, 600)).toBe(0)
  })

  it('handles 0 and large values', () => {
    expect(countAt(0, 0, 600, 600)).toBe(0)
    expect(countAt(0, 1_000_000, 600, 600)).toBe(1_000_000)
    expect(countAt(0, 1_000_000, 300, 600)).toBe(750_000)
  })

  it('treats a duration of 0 or less as already done, and a negative elapsed time as the start', () => {
    expect(countAt(0, 8, 0, 0)).toBe(8)
    expect(countAt(0, 8, -50, 600)).toBe(0)
  })
})

describe('COUNT_TICK_MS', () => {
  it('allows at most 15 displayed changes a second', () => {
    expect(COUNT_TICK_MS).toBeCloseTo(1000 / 15)
  })
})
