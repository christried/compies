import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

// The hover tint is one utility (#33). On Dunkel (and System on a dark device) 8 % of cream read as faint (#43, #406), so
// the utility carries a stronger tint under the `dark` variant. The seam is the stylesheet through Tailwind's compiler:
// jsdom computes no cascade, so no test can read the colour of a rendered element.
const theme = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-theme.css'), 'utf8')

/** Comments do not count. */
const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const normalise = (text: string) => text.replace(/\[data-theme="(\w+)"\]/g, '[data-theme=$1]').replace(/\s+/g, ' ').trim()

const variant = clean(theme).match(/@custom-variant dark\s*\{[\s\S]*?\n\}/)?.[0]
const tint = clean(theme).match(/@utility tint\s*\{[\s\S]*?\n\}/)?.[0]
const lift = clean(theme).match(/@utility lift\s*\{[\s\S]*?\n\}/)?.[0]

/** The percentage of the first `var(--cp-ink) N%` after the pattern's match. */
const percentAfter = (css: string, pattern: RegExp) => Number(css.match(pattern)?.[1])

describe('the hover tint', () => {
  it('has the three pieces it compiles from', () => {
    expect(variant).toBeDefined()
    expect(tint).toBeDefined()
    expect(lift).toBeDefined()
  })

  it('has no data-theme text of its own: the dark variant is the only way in', () => {
    expect(tint).not.toContain('data-theme')
  })

  describe('compiled', () => {
    const build = async (candidates: string[]) => {
      const compiler = await compile(`${variant}\n${tint}\n${lift}\n@tailwind utilities;`)
      return normalise(compiler.build(candidates))
    }

    it('is 8 % outside any dark rule: Hell does not change', async () => {
      const css = await build(['hover:tint'])
      expect(percentAfter(css, /\.hover\\:tint:hover \{[\s\S]*?var\(--cp-ink\) (\d+)%/)).toBe(8)
    })

    it('is 14 % on Dunkel', async () => {
      const css = await build(['hover:tint'])
      expect(percentAfter(css, /\.hover\\:tint:hover:where\(\[data-theme=dark\], \[data-theme=dark\] \*\) \{[\s\S]*?var\(--cp-ink\) (\d+)%/)).toBe(14)
    })

    it('is 14 % on System with a device that asks for dark', async () => {
      const css = await build(['hover:tint'])
      expect(percentAfter(css, /@media \(prefers-color-scheme: dark\) \{ \.hover\\:tint:hover:where\(\[data-theme=system\], \[data-theme=system\] \*\) \{[\s\S]*?var\(--cp-ink\) (\d+)%/)).toBe(14)
    })

    it('stays between 14 % and 16 % on Dunkel', async () => {
      // Below 14 % the 1.45:1 target (hover against resting) is missed; above 16 % `text-ink-2` on the nav falls under 4.5:1.
      const css = await build(['hover:tint'])
      const dark = percentAfter(css, /\.hover\\:tint:hover:where\(\[data-theme=dark\], \[data-theme=dark\] \*\) \{[\s\S]*?var\(--cp-ink\) (\d+)%/)
      expect(dark).toBeGreaterThanOrEqual(14)
      expect(dark).toBeLessThanOrEqual(16)
    })

    it('reaches the reduced-motion hover of every lift control, with both twins', async () => {
      const css = await build(['lift'])
      expect(css).toContain('[data-theme=dark]')
      expect(css).toContain('@media (prefers-color-scheme: dark) {')
      expect(css).toContain('[data-theme=system]')
      expect(css).toContain('var(--cp-ink) 14%')
    })
  })
})
