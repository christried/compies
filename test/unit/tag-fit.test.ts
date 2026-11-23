import { describe, expect, it } from 'vitest'
import { TAG_MAX, TAGS_PER_GAME_MAX } from '../../shared/game'
import { fitTags } from '../../app/utils/tag-fit'

// How many of a card's Tag chips show (#711): a greedy line fill over the chips' measured widths, with „+X“ part of the flow after the
// last chip. The numbers are px: a 146 px row, a 4 px gap and a 28 px „+X“.

const base = { rowWidth: 146, gap: 4, moreWidth: 28 }
const fit = (widths: number[], rows: number, over: Partial<typeof base> = {}) => fitTags({ widths, rows, ...base, ...over })

describe('fitTags (#711)', () => {
  it('shows nothing for no chips', () => {
    expect(fit([], 2)).toBe(0)
  })

  it('shows all chips that fit in two lines, with no „+X“', () => {
    expect(fit([40, 40, 40], 2)).toBe(3)
  })

  it('fills two chips to a line and shows all four when they fit', () => {
    expect(fit([60, 60, 60, 60], 2)).toBe(4)
  })

  it('shows all chips with no room left for „+X“ when nothing is hidden', () => {
    expect(fit([70, 70, 70, 70], 2)).toBe(4)
  })

  it('keeps room for „+X“ after the last chip shown when some are hidden', () => {
    // Line 1: two chips (124); line 2: one chip, then „+X“ at 60 + 4 + 28 = 92.
    expect(fit([60, 60, 60, 60, 60, 60], 2)).toBe(3)
  })

  it('fits one line: the second chip does not, and „+X“ needs its room', () => {
    // 60 + 4 + 60 + 4 + 60 = 188 > 146, and two chips with „+X“ need 156.
    expect(fit([60, 60, 60], 1)).toBe(1)
  })

  it('counts a chip wider than the row as a whole row: it has line 1 and the next chip line 2', () => {
    expect(fit([200, 40], 2)).toBe(2)
  })

  it('puts „+X“ on line 2 when two over-wide chips take both lines', () => {
    expect(fit([200, 200, 40], 2)).toBe(1)
  })

  it('never shows fewer than one chip: an over-wide first chip stays in one line', () => {
    expect(fit([200, 40], 1)).toBe(1)
    expect(fit([200, 200, 200], 1)).toBe(1)
  })

  it('joins a chip that fills the line exactly (<=)', () => {
    expect(fit([71, 71], 1)).toBe(2)
    expect(fit([71, 72], 1)).toBe(1)
  })

  it('works with fractional widths', () => {
    expect(fit([70.5, 70.5], 1)).toBe(2)
    expect(fit([70.5, 71.6], 1)).toBe(1)
  })

  it('shows every chip where there is no layout (a row of 0 or less)', () => {
    expect(fit([60, 60, 60, 60, 60, 60], 2, { rowWidth: 0 })).toBe(6)
    expect(fit([60, 60], 1, { rowWidth: -1 })).toBe(2)
    expect(fit([], 2, { rowWidth: 0 })).toBe(0)
  })

  it('takes one chip as wide as the row for a whole line', () => {
    expect(fit([146, 146], 2)).toBe(2)
    expect(fit([146, 146, 146], 2)).toBe(1)
    expect(fit([146, 40], 1)).toBe(1)
  })

  it('fits the longest allowed chip set: 8 chips of 20 characters', () => {
    const widths = Array.from({ length: TAGS_PER_GAME_MAX }, () => TAG_MAX * 7 + 16)
    expect(widths).toHaveLength(8)
    // Each 156 px chip is wider than the 146 px row, so it counts 146 and takes a whole line.
    expect(fit(widths, 2)).toBe(1)
    expect(fit(widths, 1)).toBe(1)
    // Two to a line fit four chips in two lines: with „+X“ after the third, three show; on a row that holds all eight in one line, all show.
    expect(fit(widths, 2, { rowWidth: 330 })).toBe(3)
    expect(fit(widths, 2, { rowWidth: 1400 })).toBe(8)
  })
})
