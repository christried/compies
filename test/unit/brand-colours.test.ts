import { describe, expect, it } from 'vitest'
import { cut } from '../../scripts/browser/contrast.mjs'
import { colour, contrast, dark, light, tokens } from './css-tokens'

// The Discord and Twitch sign-in buttons (#792) carry the brands' fills with white text, the same in Hell and Dunkel, so
// the four tokens live in the light block only and the dark and System blocks inherit them. 4.5:1 is the ticket's floor;
// the Hell and Dunkel check confirms it on the page.
const BRANDS = ['discord', 'twitch'] as const

describe('the brand colours of the sign-in buttons', () => {
  it.each(BRANDS)('%s: white text on the fill reads at least 4.5:1', (brand) => {
    const ratio = contrast(colour(light, `cp-on-${brand}`), colour(light, `cp-${brand}`))
    expect(Number(cut(ratio))).toBeGreaterThanOrEqual(4.5)
  })

  it('set the four tokens in the light block only', () => {
    const names = BRANDS.flatMap(brand => [`--cp-${brand}:`, `--cp-on-${brand}:`])
    const system = tokens.match(/\[data-theme="system"\] \{[\s\S]*?\n {2}\}/)?.[0] ?? ''
    expect(system).toContain('--cp-paper:')
    for (const name of names) {
      expect(light).toContain(name)
      expect(dark).not.toContain(name)
      expect(system).not.toContain(name)
    }
  })
})
