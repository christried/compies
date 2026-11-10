import { describe, expect, it } from 'vitest'
import { build, darkVariant, themeBlock } from './css-tokens'

// The hover tint is one utility (#33). On Dunkel (and System on a dark device) 8 % of cream read as faint (#43, #406), so
// the utility carries a stronger tint under the `dark` variant. The seam is the stylesheet through Tailwind's compiler:
// jsdom computes no cascade, so no test can read the colour of a rendered element.
const tint = themeBlock(/@utility tint/)
const lift = themeBlock(/@utility lift/)

/** The percentage of the first `var(--cp-ink) N%` after the pattern's match. */
const percentAfter = (css: string, pattern: RegExp) => Number(css.match(pattern)?.[1])

describe('the hover tint', () => {
  it('has the three pieces it compiles from', () => {
    expect(darkVariant).toBeDefined()
    expect(tint).toBeDefined()
    expect(lift).toBeDefined()
  })

  it('has no data-theme text of its own: the dark variant is the only way in', () => {
    expect(tint).not.toContain('data-theme')
  })

  describe('compiled', () => {
    const buildTint = (candidates: string[]) => build(`${tint}\n${lift}`, candidates)

    it('is 8 % outside any dark rule: Hell does not change', async () => {
      const css = await buildTint(['hover:tint'])
      expect(percentAfter(css, /\.hover\\:tint:hover \{[\s\S]*?var\(--cp-ink\) (\d+)%/)).toBe(8)
    })

    it('is 14 % on Dunkel', async () => {
      const css = await buildTint(['hover:tint'])
      expect(percentAfter(css, /\.hover\\:tint:hover:where\(\[data-theme=dark\], \[data-theme=dark\] \*\) \{[\s\S]*?var\(--cp-ink\) (\d+)%/)).toBe(14)
    })

    it('is 14 % on System with a device that asks for dark', async () => {
      const css = await buildTint(['hover:tint'])
      expect(percentAfter(css, /@media \(prefers-color-scheme: dark\) \{ \.hover\\:tint:hover:where\(\[data-theme=system\], \[data-theme=system\] \*\) \{[\s\S]*?var\(--cp-ink\) (\d+)%/)).toBe(14)
    })

    it('stays between 14 % and 16 % on Dunkel', async () => {
      // Below 14 % the 1.45:1 target (hover against resting) is missed; above 16 % `text-ink-2` on the nav falls under 4.5:1.
      const css = await buildTint(['hover:tint'])
      const dark = percentAfter(css, /\.hover\\:tint:hover:where\(\[data-theme=dark\], \[data-theme=dark\] \*\) \{[\s\S]*?var\(--cp-ink\) (\d+)%/)
      expect(dark).toBeGreaterThanOrEqual(14)
      expect(dark).toBeLessThanOrEqual(16)
    })

    it('reaches the reduced-motion hover of every lift control, with both twins', async () => {
      const css = await buildTint(['lift'])
      expect(css).toContain('[data-theme=dark]')
      expect(css).toContain('@media (prefers-color-scheme: dark) {')
      expect(css).toContain('[data-theme=system]')
      expect(css).toContain('var(--cp-ink) 14%')
    })
  })
})
