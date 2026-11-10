import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'
import { ratio } from '../../scripts/browser/contrast.mjs'

// Text for reading takes `text-ink-2` in Dunkel, not `text-ink-3`: `--cp-ink-3` is the token for disabled text only, and on
// the Dunkel surface it reads 3.24:1 (#409). Hell keeps `text-ink-3` (3.55:1), so the fix sits under the `dark` variant alone.
// The seam is the token file and the stylesheet as text: jsdom computes no cascade, so no test can read a rendered colour.
const tokens = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-tokens.css'), 'utf8')
const theme = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-theme.css'), 'utf8')

/** The body of the light block (`:root, [data-theme="light"]`) or the dark one (`[data-theme="dark"]`), up to its closing brace at line start. */
const block = (selector: RegExp) => tokens.match(selector)?.[0] ?? ''
const dark = block(/\[data-theme="dark"\] \{[\s\S]*?\n\}/)

/** The value of a token in a block; the colon right after the name keeps `--cp-ink-2` and `--cp-ink-3` apart from `--cp-ink`. */
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

/** Comments do not count. */
const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const normalise = (text: string) => text.replace(/\[data-theme="(\w+)"\]/g, '[data-theme=$1]').replace(/\s+/g, ' ').trim()

const variant = clean(theme).match(/@custom-variant dark\s*\{[\s\S]*?\n\}/)?.[0]

describe('text for reading in Dunkel', () => {
  it('has the dark variant it compiles from', () => {
    expect(variant).toBeDefined()
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
    const build = async (candidates: string[]) => {
      const compiler = await compile(`${variant}\n@theme inline {\n  --color-*: initial;\n  --color-ink-2: var(--cp-ink-2);\n  --color-ink-3: var(--cp-ink-3);\n}\n@tailwind utilities;`)
      return normalise(compiler.build(candidates))
    }

    it('emits dark:text-ink-2 only under the dark selectors, with ink-2', async () => {
      const css = await build(['text-ink-3', 'dark:text-ink-2'])
      expect(css).toMatch(/\.dark\\:text-ink-2:where\(\[data-theme=dark\], \[data-theme=dark\] \*\) \{ color: var\(--cp-ink-2\); \}/)
      expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{ \.dark\\:text-ink-2:where\(\[data-theme=system\], \[data-theme=system\] \*\) \{ color: var\(--cp-ink-2\); \} \}/)
    })

    it('leaves Hell alone: no dark:text-ink-2 rule lacks a dark selector, and the plain ink-3 rule comes first', async () => {
      const css = await build(['text-ink-3', 'dark:text-ink-2'])
      expect(css).not.toMatch(/\.dark\\:text-ink-2(?!:where\(\[data-theme=(dark|system)\])/)
      const plain = css.indexOf('.text-ink-3 {')
      expect(plain).toBeGreaterThanOrEqual(0)
      expect(plain).toBeLessThan(css.indexOf('.dark\\:text-ink-2'))
    })
  })
})
