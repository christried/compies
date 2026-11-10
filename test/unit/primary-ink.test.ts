import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ratio } from '../../scripts/browser/contrast.mjs'

// Text on a primary fill (the current page's footer link, the newest Release's chip) takes `--cp-on-primary`, not
// `--cp-ink`: in Dunkel ink flips to cream and reads 1.26:1 on the yellow (#411). The seam is the token file as text:
// jsdom computes no cascade, so no test can read the colour of a rendered element.
const tokens = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-tokens.css'), 'utf8')

/** The body of the light block (`:root, [data-theme="light"]`) or the dark one (`[data-theme="dark"]`), up to its closing brace at line start. */
const block = (selector: RegExp) => tokens.match(selector)?.[0] ?? ''
const light = block(/:root, \[data-theme="light"\] \{[\s\S]*?\n\}/)
const dark = block(/\[data-theme="dark"\] \{[\s\S]*?\n\}/)

/** The value of a token in a block; the colon right after the name keeps `--cp-on-primary` and `--cp-ink-2` apart from `--cp-ink`. */
const colour = (css: string, name: string) => {
  const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
  if (!value) throw new Error(`--${name} is not in its block`)
  return value
}

const rgba = (value: string): [number, number, number, number] => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
  1,
]
const contrast = (a: string, b: string) => ratio(rgba(a), rgba(b))

describe('text on the primary fill', () => {
  it('is the same colour as ink in Hell, so the swap from text-ink changes nothing there', () => {
    expect(colour(light, 'cp-on-primary')).toBe(colour(light, 'cp-ink'))
  })

  it('reads on the primary fill in Hell', () => {
    expect(contrast(colour(light, 'cp-on-primary'), colour(light, 'cp-primary'))).toBeGreaterThanOrEqual(4.5)
  })

  it('reads on the primary fill in Dunkel', () => {
    expect(contrast(colour(dark, 'cp-on-primary'), colour(dark, 'cp-primary'))).toBeGreaterThanOrEqual(4.5)
  })

  it('does not read on the primary fill in Dunkel with ink: why a text on primary takes text-on-primary', () => {
    // The day the tokens change so that ink reads on the yellow, this case says the swap is no longer needed.
    expect(contrast(colour(dark, 'cp-ink'), colour(dark, 'cp-primary'))).toBeLessThan(4.5)
  })

  it('does not read on the surface in Dunkel: why the Dunkel marker covers the whole line, not the lower 45 %', () => {
    // Pins the design reason of the footer's highlighter (brief 409b): no text colour reads on both the yellow and the surface.
    expect(contrast(colour(dark, 'cp-on-primary'), colour(dark, 'cp-surface'))).toBeLessThan(4.5)
  })
})
