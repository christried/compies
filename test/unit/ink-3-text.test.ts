import { describe, expect, it } from 'vitest'
import { build, colour, contrast, dark, darkVariant } from './css-tokens'

// Text for reading takes `text-ink-2` in Dunkel, not `text-ink-3`: `--cp-ink-3` is the token for disabled text only, and on
// the Dunkel surface it reads 3.24:1 (#409). Hell keeps `text-ink-3` (3.55:1), so the fix sits under the `dark` variant alone.
// The seam is the token file and the stylesheet as text: jsdom computes no cascade, so no test can read a rendered colour.
describe('text for reading in Dunkel', () => {
  it('has the dark variant it compiles from', () => {
    expect(darkVariant).toBeDefined()
  })

  it('cannot stay on ink-3: it reads 3.24:1 on the Dunkel surface', () => {
    const ratioOnSurface = contrast(colour(dark, 'cp-ink-3'), colour(dark, 'cp-surface'))
    expect(ratioOnSurface).toBeLessThan(4.5)
    expect(Math.round(ratioOnSurface * 100) / 100).toBe(3.24)
  })

  it('reads ink-2 on the Dunkel surface and on the Dunkel paper', () => {
    expect(contrast(colour(dark, 'cp-ink-2'), colour(dark, 'cp-surface'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colour(dark, 'cp-ink-2'), colour(dark, 'cp-paper'))).toBeGreaterThanOrEqual(4.5)
  })

  describe('compiled', () => {
    const buildInk = (candidates: string[]) =>
      build('@theme inline {\n  --color-*: initial;\n  --color-ink-2: var(--cp-ink-2);\n  --color-ink-3: var(--cp-ink-3);\n}', candidates)

    it('emits dark:text-ink-2 only under the dark selectors, with ink-2', async () => {
      const css = await buildInk(['text-ink-3', 'dark:text-ink-2'])
      expect(css).toMatch(/\.dark\\:text-ink-2:where\(\[data-theme=dark\], \[data-theme=dark\] \*\) \{ color: var\(--cp-ink-2\); \}/)
      expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{ \.dark\\:text-ink-2:where\(\[data-theme=system\], \[data-theme=system\] \*\) \{ color: var\(--cp-ink-2\); \} \}/)
    })

    it('leaves Hell alone: no dark:text-ink-2 rule lacks a dark selector, and the plain ink-3 rule comes first', async () => {
      const css = await buildInk(['text-ink-3', 'dark:text-ink-2'])
      expect(css).not.toMatch(/\.dark\\:text-ink-2(?!:where\(\[data-theme=(dark|system)\])/)
      const plain = css.indexOf('.text-ink-3 {')
      expect(plain).toBeGreaterThanOrEqual(0)
      expect(plain).toBeLessThan(css.indexOf('.dark\\:text-ink-2'))
    })
  })
})
