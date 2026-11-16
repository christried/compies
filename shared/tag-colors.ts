// The colour of each Tag chip (#427, GLOSSARY: Tag): one of the eight Team colours, so the Tags of a game are told apart at a
// glance. A Tag's own colour comes from its key (the label's spelling does not matter), so a Tag keeps its colour on every game
// and page unless it clashes: within one game, a Tag whose own colour an earlier Tag of that game already wears takes the next
// free one.

import type { GameTag } from './game'
import { TEAM_COUNT_MAX } from './team-position'

/** As many Tag colours as Team colours. */
const COLOR_COUNT = TEAM_COUNT_MAX

/**
 * The colour a Tag key wears when nothing clashes: 1 to 8, from a 32-bit FNV-1a hash of the key's UTF-16 code units. FNV's
 * low bits see only the low bits of each character, so Murmur3's finaliser mixes the high bits down before the remainder.
 * Changing this recolours every library: `tag-colors.test.ts` pins a few keys.
 */
function ownColor(key: string): number {
  let hash = 0x811C9DC5
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85EBCA6B)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xC2B2AE35)
  hash ^= hash >>> 16
  return ((hash >>> 0) % COLOR_COUNT) + 1
}

/**
 * The colours of a game's Tags (1 to 8, a Team position), in the game's Tag order. A Tag whose own colour an earlier Tag
 * already wears takes the next colour not yet used (8 cycles to 1), so the first 8 Tags never share one; past 8 the colours
 * start over.
 */
export function tagColors(keys: readonly string[]): number[] {
  const used = new Set<number>()
  return keys.map((key) => {
    if (used.size === COLOR_COUNT) used.clear()
    let color = ownColor(key)
    while (used.has(color)) color = (color % COLOR_COUNT) + 1
    used.add(color)
    return color
  })
}

/** A game's Tags with their colours, in the game's Tag order: what every Tag chip renders from. */
export function colorTags<T extends GameTag>(tags: readonly T[]): (T & { color: number })[] {
  const colors = tagColors(tags.map(tag => tag.key))
  return tags.map((tag, index) => ({ ...tag, color: colors[index]! }))
}
