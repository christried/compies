import { describe, expect, it } from 'vitest'
import { tagColors } from '../../shared/tag-colors'
import { TEAM_COLORS } from '../../shared/team-colors'

// Each Tag chip takes one of the eight Team colours (#427): by its key, and different from the Tags before it on the same game.

describe('tagColors', () => {
  it('gives each Tag a colour from 1 to 8, the same for the same key on every call', () => {
    const colours = tagColors(['retro', 'co-op', 'party'])

    expect(colours).toHaveLength(3)
    for (const colour of colours) expect([1, 2, 3, 4, 5, 6, 7, 8]).toContain(colour)
    expect(tagColors(['retro', 'co-op', 'party'])).toEqual(colours)
  })

  // A change to the hash would recolour every Tag in every library at the next deploy.
  it.each([['retro', 7], ['co-op', 1], ['koop', 2], ['horror', 5], ['indie', 7], ['rätsel', 8]])('keeps the colour of „%s“ at %i across releases', (key, colour) => {
    expect(ownColour(key)).toBe(colour)
  })

  it('gives a later Tag the next colour not yet used on the game when its own is taken, and the first Tag keeps its own', () => {
    const own = ownColour('retro')
    const twin = keyWhere(key => ownColour(key) === own)
    const next = own % 8 + 1

    expect(tagColors(['retro', twin])).toEqual([own, next])
    expect(tagColors([twin, 'retro'])).toEqual([own, next])
  })

  it('cycles past 8 back to 1 when looking for a free colour', () => {
    const eights = keysWhere(key => ownColour(key) === 8, 2)

    expect(tagColors(eights)).toEqual([8, 1])
  })

  it('keeps a Tag its own colour on another game where nothing clashes', () => {
    const own = ownColour('retro')
    const other = keyWhere(key => ownColour(key) !== own)

    expect(tagColors([other, 'retro'])[1]).toBe(own)
  })

  it('never repeats a colour on a game with up to 8 Tags, even when all their own colours are the same', () => {
    const same = keysWhere(key => ownColour(key) === 3, 8)

    expect(new Set(tagColors(same)).size).toBe(8)
    expect(tagColors(same)).toEqual([3, 4, 5, 6, 7, 8, 1, 2])
  })

  it('repeats colours only once all 8 are in use', () => {
    const keys = keysWhere(() => true, 12)
    const colours = tagColors(keys)

    expect(new Set(colours.slice(0, 8)).size).toBe(8)
    expect(new Set(colours.slice(8)).size).toBe(4)
  })
})

// A chip is its Team colour with that colour's ink, the same in light and dark (the tokens have no dark override); 11 px bold
// is normal-size text to WCAG, so AA asks for 4.5:1. `team-colors.test.ts` keeps TEAM_COLORS equal to the tokens.
describe('the Tag chip colours', () => {
  it.each(TEAM_COLORS.map((colour, index) => [index + 1, colour] as const))('colour %i has ink at WCAG AA contrast', (_, { fill, ink }) => {
    expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5)
  })
})

/** The WCAG 2.1 contrast ratio of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A key's colour alone: its colour on a game with no other Tag. */
function ownColour(key: string): number {
  return tagColors([key])[0]!
}

/** The first `count` keys `tag-0`, `tag-1`, … that `wanted` accepts. */
function keysWhere(wanted: (key: string) => boolean, count: number): string[] {
  const keys: string[] = []
  for (let index = 0; keys.length < count; index++) {
    if (index > 10_000) throw new Error('no such keys')
    const key = `tag-${index}`
    if (wanted(key)) keys.push(key)
  }
  return keys
}

function keyWhere(wanted: (key: string) => boolean): string {
  return keysWhere(key => key !== 'retro' && wanted(key), 1)[0]!
}
