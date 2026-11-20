import { describe, expect, it } from 'vitest'
import { voteCountTone } from '~/utils/vote-look'
import { build, colour, contrast, dark, light } from './css-tokens'

// The vote count on the Event page is coloured by the Has voted rule (#798): everyone green, some yellow, nobody red.
// The colour does not carry the meaning alone (the numbers stay in the text), but it must read in Hell and in Dunkel.
describe('voteCountTone', () => {
  it.each([
    [3, 3, 'text-success-fg'],
    [1, 1, 'text-success-fg'],
    [2, 3, 'text-warning-fg'],
    [1, 3, 'text-warning-fg'],
    [0, 3, 'text-error-fg'],
    // No future Slot left: nobody has voted (server/domain/poll.ts hasVoted), so 0 of 0 is red.
    [0, 0, 'text-error-fg'],
  ])('%i of %i reads %s', (voted, total, tone) => {
    expect(voteCountTone({ voted, total })).toBe(tone)
  })
})

describe('the three tones in Hell and Dunkel', () => {
  const tones = ['success', 'warning', 'error'] as const

  it('compile to the foreground tokens', async () => {
    const css = await build(
      '@theme inline {\n  --color-*: initial;\n  --color-success-fg: var(--cp-success-fg);\n  --color-warning-fg: var(--cp-warning-fg);\n  --color-error-fg: var(--cp-error-fg);\n}',
      tones.map(tone => `text-${tone}-fg`),
    )
    for (const tone of tones) expect(css).toContain(`.text-${tone}-fg { color: var(--cp-${tone}-fg); }`)
  })

  describe.each([['Hell', light], ['Dunkel', dark]])('%s', (_name, block) => {
    it.each(tones)('reads %s at 4.5:1 on the paper and on the surface', (tone) => {
      expect(contrast(colour(block, `cp-${tone}-fg`), colour(block, 'cp-paper'))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colour(block, `cp-${tone}-fg`), colour(block, 'cp-surface'))).toBeGreaterThanOrEqual(4.5)
    })

    it('tells the three apart', () => {
      const colours = tones.map(tone => colour(block, `cp-${tone}-fg`))
      expect(new Set(colours).size).toBe(3)
    })
  })
})
