import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cut, hex, over } from '../support/contrast.mjs'
import { colour, contrast, dark, light, theme, tokens } from './css-tokens'

const button = readFileSync(resolve(import.meta.dirname, '../../app/components/AppButton.vue'), 'utf8')

// The Discord and Twitch sign-in buttons (#792) carry the brands' fills with white text, the same in Hell and Dunkel, so
// the four tokens live in the light block only and the dark and System blocks inherit them. 4.5:1 is the ticket's floor;
// the Hell and Dunkel check confirms it on the page.
const BRANDS = ['discord', 'twitch'] as const

describe('the brand colours of the sign-in buttons', () => {
  it.each(BRANDS)('%s: white text on the fill reads at least 4.5:1', (brand) => {
    const ratio = contrast(colour(light, `cp-on-${brand}`), colour(light, `cp-${brand}`))
    expect(Number(cut(ratio))).toBeGreaterThanOrEqual(4.5)
  })

  // The reduced-motion hover is the tint: 8 % (Hell) or 14 % (Dunkel) of an ink over the fill. Cream at 14 % took the white
  // text to about 3.7:1 and 3.8:1 (#792's merge comment); the brand variants set the tint's ink to black instead (#812).
  it.each(BRANDS)('%s: the Dunkel hover tint keeps the white text at 4.5:1, since the variant darkens with black', (brand) => {
    const fill = colour(light, `cp-${brand}`)
    const fillRgba = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16)).concat(1) as [number, number, number, number]
    const tinted = hex(over([0, 0, 0, 0.14], fillRgba))
    const creamTinted = hex(over([0xf7, 0xef, 0xe1, 0.14], fillRgba))

    expect(Number(cut(contrast(colour(light, `cp-on-${brand}`), tinted)))).toBeGreaterThanOrEqual(4.5)
    expect(Number(cut(contrast(colour(light, `cp-on-${brand}`), creamTinted)))).toBeLessThan(4.5)
    expect(button).toContain(`${brand}: 'bg-${brand} text-on-${brand} [--cp-tint-ink:#000]'`)
  })

  it('lets the tint read its ink from --cp-tint-ink, with the theme\'s ink as the default', () => {
    const tint = theme.match(/@utility tint \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(tint.match(/var\(--cp-tint-ink, var\(--cp-ink\)\)/g)).toHaveLength(4)
    expect(tint).not.toMatch(/color-mix\(in srgb, var\(--cp-ink\)/)
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
