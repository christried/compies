import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ratio } from '../../scripts/browser/contrast.mjs'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

// The error toast's buttons take `dark:focus-visible:outline-on-error` (#409, #433): the base ring is --cp-focus, which reads
// 1.48:1 on the Dunkel error fill, and --cp-on-error reads 5.93:1 there. Hell keeps the base ring. The seam is the token file
// and the stylesheet as text, through Tailwind's compiler: jsdom computes no cascade, so no test can read a rendered ring.
const tokens = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-tokens.css'), 'utf8')
const theme = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-theme.css'), 'utf8')

/** Comments do not count. */
const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const normalise = (text: string) => text.replace(/\[data-theme="(\w+)"\]/g, '[data-theme=$1]').replace(/\s+/g, ' ').trim()

/** The body of the light block (`:root, [data-theme="light"]`) or the dark one (`[data-theme="dark"]`), up to its closing brace at line start. */
const block = (selector: RegExp) => tokens.match(selector)?.[0] ?? ''
const light = block(/:root, \[data-theme="light"\] \{[\s\S]*?\n\}/)
const dark = block(/\[data-theme="dark"\] \{[\s\S]*?\n\}/)

/** The value of a token in a block; the colon right after the name keeps `--cp-on-error` and `--cp-ink-2` apart from `--cp-ink`. */
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

const variant = clean(theme).match(/@custom-variant dark\s*\{[\s\S]*?\n\}/)?.[0] ?? ''

const build = async (candidates: string[]) => {
  const compiler = await compile(`${variant}\n@theme inline { --color-*: initial; --color-on-error: var(--cp-on-error); }\n@tailwind utilities;`)
  return normalise(compiler.build(candidates))
}

describe('the error toast ring in Dunkel', () => {
  it('the default ring does not read on the red toast: why the buttons take a ring of their own', () => {
    expect(contrast(colour(dark, 'cp-focus'), colour(dark, 'cp-error'))).toBeLessThan(3)
  })

  it('--cp-on-error reads on the red toast', () => {
    expect(contrast(colour(dark, 'cp-on-error'), colour(dark, 'cp-error'))).toBeGreaterThanOrEqual(3)
  })

  it('the default ring reads on the surface: why the other tones keep the default ring', () => {
    expect(contrast(colour(dark, 'cp-focus'), colour(dark, 'cp-surface'))).toBeGreaterThanOrEqual(3)
  })

  it('the candidate draws --cp-on-error only under the dark selectors, with both twins', async () => {
    const css = await build(['dark:focus-visible:outline-on-error'])
    expect(css).toMatch(/:where\(\[data-theme=dark\], \[data-theme=dark\] \*\):focus-visible \{ outline-color: var\(--cp-on-error\)/)
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{ \.dark\\:focus-visible\\:outline-on-error:where\(\[data-theme=system\], \[data-theme=system\] \*\):focus-visible \{ outline-color: var\(--cp-on-error\)/)
  })

  it('Hell does not change: no outline-on-error rule applies outside the dark selectors', async () => {
    // Hell keeps its ring (#1f5fe0 on the red, 1.71:1); the open Hell follow-up is the user's call (#409).
    const css = await build(['dark:focus-visible:outline-on-error'])
    const selectors = [...css.matchAll(/([^{};]*outline-on-error[^{}]*)\{/g)].map(match => match[1])
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector.includes(':where([data-theme=dark]') || selector.includes(':where([data-theme=system]')).toBe(true)
    }
  })
})
