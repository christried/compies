import { describe, expect, it } from 'vitest'
import { ceremonyLayout } from '../../app/utils/ceremony'
import { ceremonySizes } from '../../app/utils/ceremony-sizes'

// The Award ceremony's sizes (#315, #328, #364): `ceremonySizes` is the one place the numbers that change with `roomy` live. The width of the
// Winner group, which the plate takes, is pinned with today's numbers for a chain of 2 and 3 Winners and a grid, wide and phone; the single
// card's people, the ground, Compibert and the confetti with the numbers of the table in #364. The layouts come from the real `ceremonyLayout`,
// so the test follows the screen's own rule. Every phone width is 354 px: the 390 px screen less the stage's 18 px padding on each side.

const sizesOf = (winners: number, below: number, roomy: boolean) => ceremonySizes(roomy, ceremonyLayout(winners, below, roomy), winners)

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
    expect(ceremonySizes(roomy, layout, winners).groupWidth).toBe(width)
  })

  it('is null for a sole Winner: the single stage has no plate', () => {
    expect(sizesOf(1, 0, true).groupWidth).toBeNull()
    expect(sizesOf(1, 3, false).groupWidth).toBeNull()
  })
})

describe('the size tables', () => {
  it('give a chain of 2 Winners on a wide screen the artboard sizes, and a phone its own', () => {
    expect(sizesOf(2, 2, true).stage).toMatchObject({ kind: 'chain', cardWidth: 240, cardHeight: 160, avatarSize: 56, pointsPadding: '12px 14px' })
    expect(sizesOf(2, 2, false).stage).toMatchObject({ kind: 'chain', cardWidth: 160, avatarSize: 44, personNameFontSize: 12 })
  })

  it('pick a chain\'s table by the screen and the number of Winners', () => {
    expect(sizesOf(3, 0, true).stage).toMatchObject({ kind: 'chain', cardWidth: 220 })
    expect(sizesOf(2, 0, false).stage).toMatchObject({ kind: 'chain', cardWidth: 160 })
  })

  it('give a grid card its wide and phone sizes, and the plate its two heights', () => {
    expect(sizesOf(4, 0, true).stage).toMatchObject({ kind: 'grid', cardWidth: 236, avatarSize: 28, avatarOverlap: 8 })
    expect(sizesOf(4, 0, false).stage).toMatchObject({ kind: 'grid', cardWidth: 171, avatarSize: 24, avatarOverlap: 7 })
    expect(sizesOf(4, 0, true).plate).toEqual({ height: 40, labelFontSize: 15, stampFontSize: 20 })
    expect(sizesOf(4, 0, false).plate).toEqual({ height: 34, labelFontSize: 12, stampFontSize: 15 })
  })

  it.each([
    ['one Winner', 1, 'single'],
    ['2 Winners', 2, 'chain'],
    ['3 Winners', 3, 'chain'],
    ['4 Winners', 4, 'grid'],
    ['8 Winners', 8, 'grid'],
  ])('name the stage the layout draws for %s: %s', (_name, winners, kind) => {
    expect(sizesOf(winners, 0, true).stage.kind).toBe(kind)
  })
})

describe('the single card, the ground, Compibert and the confetti', () => {
  it('give a sole Winner on a wide screen the 80 px people, 150 px Compibert, a 162 px stage padding and 40 / 14 pieces', () => {
    expect(sizesOf(1, 0, true)).toMatchObject({
      stage: { kind: 'single', avatarSize: 80, cellWidth: 96, peopleMaxWidth: 308 },
      compibert: 150,
      ground: { paddingBottom: 162, shareBottom: 34 },
      confetti: { stamp: 40, card: 14 },
    })
  })

  it('give a sole Winner on a phone the 64 px people, 120 px Compibert, a 198 px padding (his track and the share row), the share row on his track and 20 / 8 pieces', () => {
    expect(sizesOf(1, 0, false)).toMatchObject({
      stage: { kind: 'single', avatarSize: 64, cellWidth: 80, peopleMaxWidth: 260 },
      compibert: 120,
      ground: { paddingBottom: 198, shareBottom: 136 },
      confetti: { stamp: 20, card: 8 },
    })
  })

  it.each([true, false])('keep the plate, Compibert, the ground and the confetti the same for a chain and a grid (roomy: %s)', (roomy) => {
    const chain = sizesOf(2, 0, roomy)
    const grid = sizesOf(8, 0, roomy)
    expect(chain.plate).toEqual(grid.plate)
    expect(chain.compibert).toBe(grid.compibert)
    expect(chain.ground).toEqual(grid.ground)
    expect(chain.confetti).toEqual(grid.confetti)
  })
})
