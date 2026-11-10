import { describe, expect, it } from 'vitest'
import { build, colour, contrast, dark } from './css-tokens'

// The error toast's buttons take `dark:focus-visible:outline-on-error` (#409, #433): the base ring is --cp-focus, which reads
// 1.48:1 on the Dunkel error fill, and --cp-on-error reads 5.93:1 there. Hell keeps the base ring. The seam is the token file
// and the stylesheet as text, through Tailwind's compiler: jsdom computes no cascade, so no test can read a rendered ring.
const buildRing = (candidates: string[]) => build('@theme inline { --color-*: initial; --color-on-error: var(--cp-on-error); }', candidates)

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
    const css = await buildRing(['dark:focus-visible:outline-on-error'])
    expect(css).toMatch(/:where\(\[data-theme=dark\], \[data-theme=dark\] \*\):focus-visible \{ outline-color: var\(--cp-on-error\)/)
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{ \.dark\\:focus-visible\\:outline-on-error:where\(\[data-theme=system\], \[data-theme=system\] \*\):focus-visible \{ outline-color: var\(--cp-on-error\)/)
  })

  it('Hell does not change: no outline-on-error rule applies outside the dark selectors', async () => {
    // Hell keeps its ring (#1f5fe0 on the red, 1.71:1); the open Hell follow-up is the user's call (#409).
    const css = await buildRing(['dark:focus-visible:outline-on-error'])
    const selectors = [...css.matchAll(/([^{};]*outline-on-error[^{}]*)\{/g)].map(match => match[1] ?? '')
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector.includes(':where([data-theme=dark]') || selector.includes(':where([data-theme=system]')).toBe(true)
    }
  })
})
