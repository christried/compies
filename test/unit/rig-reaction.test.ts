import { describe, expect, it } from 'vitest'
import { admitReaction, reactionSeconds } from '../../app/utils/rig-reaction'
import type { RigState } from '../../app/utils/compibert-rig'

// The reaction layer's rules (#928, 04-motion § Transition rules): which reaction may take over from the one that runs, and how long each lasts.
// Priority: Verwirrt 4 > Jubeln/Traurig 3 > Lachen/Wütend/Klatschen/Brüllen 2 > Winken 1; an equal or higher one replaces, a lower one is dropped.
const PRIORITY: Record<string, number> = { wave: 1, laugh: 2, angry: 2, clap: 2, roar: 2, sad: 3, cheer: 3 }
const REACTIONS = Object.keys(PRIORITY) as RigState[]

describe('admitReaction', () => {
  it('admits any reaction while nothing runs', () => {
    for (const incoming of REACTIONS) expect(admitReaction('idle', null, incoming)).toBe(true)
  })

  const pairs = REACTIONS.flatMap(running => REACTIONS.map(incoming => [running, incoming] as const))
  it.each(pairs)('over a running %s, an incoming %s is admitted when its priority is equal or higher', (running, incoming) => {
    expect(admitReaction('idle', running, incoming)).toBe(PRIORITY[incoming]! >= PRIORITY[running]!)
  })

  it('does not admit a base state or the run as a reaction', () => {
    for (const incoming of ['idle', 'run', 'suspense', 'confused', 'dance', 'excited'] as const) {
      expect(admitReaction('idle', null, incoming)).toBe(false)
      expect(admitReaction('idle', 'wave', incoming)).toBe(false)
    }
  })

  it('drops every reaction while the base is confused (errors block)', () => {
    for (const incoming of REACTIONS) {
      expect(admitReaction('confused', null, incoming)).toBe(false)
      expect(admitReaction('confused', 'wave', incoming)).toBe(false)
    }
  })

  it('does not block on the other base states', () => {
    for (const base of ['idle', 'dance', 'excited'] as const) expect(admitReaction(base, null, 'clap')).toBe(true)
  })
})

describe('reactionSeconds', () => {
  it.each([['wave', 2.2], ['laugh', 2.4], ['angry', 2.6], ['clap', 2], ['roar', 2.4], ['sad', 4], ['cheer', 4]] as const)('is the table\'s length for %s: %s s', (state, seconds) => {
    expect(reactionSeconds({ state })).toBe(seconds)
  })
})
