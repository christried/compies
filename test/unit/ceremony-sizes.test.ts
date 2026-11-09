import { describe, expect, it } from 'vitest'
import { ceremonyLayout } from '../../app/utils/ceremony'
import { chainSizes, groupWidth, gridSizes, plateSizes } from '../../app/utils/ceremony-sizes'

// The Award ceremony's sizes (#315, #328): the width of the Winner group, which the plate takes, is pinned with today's numbers for a chain
// of 2 and 3 Winners and a grid, wide and phone. The layouts come from the real `ceremonyLayout`, so the test follows the screen's own rule.
// Every phone width is 354 px: the 390 px screen less the stage's 18 px padding on each side.

describe('the Winner group width', () => {
  it.each([
    ['a chain of 2 Winners, wide', 2, 2, true, 'chain', 536],
    ['a chain of 3 Winners, wide', 3, 1, true, 'chain', 756],
    ['a chain of 2 Winners, phone', 2, 2, false, 'chain', 354],
    ['a grid of 4 Winners, wide (4 columns)', 4, 0, true, 'grid', 986],
    ['a grid of 8 Winners, wide (still 4 columns)', 8, 0, true, 'grid', 986],
    ['a grid of 3 Winners, phone (2 columns, fewer than the Winners)', 3, 1, false, 'grid', 354],
    ['a grid of 4 Winners, phone', 4, 0, false, 'grid', 354],
  ])('%s is %i px', (_name, winners, below, roomy, stage, width) => {
    const layout = ceremonyLayout(winners, below, roomy)
    expect(layout.stage).toBe(stage)
    expect(groupWidth(layout, winners, roomy)).toBe(width)
  })
})

describe('the size tables', () => {
  it('give a chain of 2 Winners on a wide screen the artboard sizes, and a phone its own', () => {
    expect(chainSizes(true, 2)).toMatchObject({ cardWidth: 240, cardHeight: 160, avatarSize: 56, pointsPadding: '12px 14px' })
    expect(chainSizes(false, 2)).toMatchObject({ cardWidth: 160, avatarSize: 44, personNameFontSize: 12 })
  })

  it('give a grid card its wide and phone sizes, and the plate its two heights', () => {
    expect(gridSizes(true)).toMatchObject({ cardWidth: 236, avatarSize: 28, avatarOverlap: 8 })
    expect(gridSizes(false)).toMatchObject({ cardWidth: 171, avatarSize: 24, avatarOverlap: 7 })
    expect(plateSizes(true)).toEqual({ height: 40, labelFontSize: 15, stampFontSize: 20 })
    expect(plateSizes(false)).toEqual({ height: 34, labelFontSize: 12, stampFontSize: 15 })
  })
})
