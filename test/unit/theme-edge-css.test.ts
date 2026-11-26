import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The edge of the Theme reveal's circle (#933, design note 20 „Kartenkante“): its rules live in the stylesheet, beside the `spread`
// rule, and jsdom cannot compute a View Transition, so the stylesheet is the seam, as in motion-utilities.test.ts. The edge's block
// runs from `.theme-edge {` to the `fade` rule, which stays as it is; without the block it is empty and each case fails.
const css = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-theme.css'), 'utf8')
const start = css.indexOf('.theme-edge {')
const end = css.indexOf('html[data-theme-reveal="fade"],')
const edge = start >= 0 && end > start ? css.slice(start, end) : ''

describe('the edge of the Theme reveal\'s circle', () => {
  it('the edge carries its view-transition name, and its group and new picture do not animate on their own', () => {
    expect(edge).toMatch(/\.theme-edge \{[^}]*view-transition-name:\s*theme-edge/)
    expect(edge).toMatch(/::view-transition-new\(theme-edge\)[^{]*\{\s*animation:\s*none/)
  })

  it('uses tokens only: no colour literal, no px literal, and the note\'s tokens by name', () => {
    expect(edge).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(edge).not.toMatch(/rgba?\(/)
    expect(edge).not.toMatch(/\d(\.\d+)?px\b/)
    for (const token of ['--cp-line', '--cp-bw', '--cp-shadow-modal', '--cp-shadow-sm', '--cp-dur-slower', '--cp-ease-io', '--cp-ease-linear']) {
      expect(edge).toContain(`var(${token})`)
    }
  })

  it('has its three keyframes: the disc grows, the shadow runs from the modal one to the small one, inset on the light side', () => {
    expect(edge).toMatch(/@keyframes cp-vt-disc \{/)
    expect(edge).toMatch(/@keyframes cp-vt-shadow \{/)
    expect(edge).toMatch(/@keyframes cp-vt-shadow-in \{/)
  })

  it('no rule targets a bare `.line` or `.shadow`: the children are `theme-edge__line` and `theme-edge__shadow`', () => {
    expect(css).not.toMatch(/\.(line|shadow)(?![\w-])/)
  })
})
