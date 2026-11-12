import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The Veto bar beside the Clip on a phone held sideways (#550): one `sideways` variant in the theme, one width token for the bar's column.
// Its min-width is the floor at which the Clip and the bar fit side by side, so the two numbers are pinned together.
const root = resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(resolve(root, file), 'utf8')
const theme = read('app/assets/css/compies-theme.css')
const tokens = read('app/assets/css/compies-tokens.css')

const variant = theme.match(/@custom-variant sideways\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const REM = 16

describe('the sideways variant', () => {
  it('is a viewport below md, at least as wide as the two columns need and at most 30rem high', () => {
    expect(variant).not.toBe('')
    expect(variant).toContain('max-height: 30rem')
    expect(variant).toMatch(/min-width: [\d.]+rem/)
    expect(variant).toMatch(/theme\(--breakpoint-md\)|max-md/)
  })

  it('starts at the width where gutters, gap, the bar column, the video floor and the borders fit', () => {
    const min = Number(variant.match(/min-width: ([\d.]+)rem/)?.[1]) * REM
    const side = Number(tokens.match(/--cp-veto-side-w:\s*([\d.]+)rem/)?.[1]) * REM
    // 2 × 10 gutters, 10 between the columns, the video floor of 200 px × 16/9 (356), the section's two 3 px borders.
    expect(min).toBe(2 * 10 + 10 + side + 356 + 6)
    expect(min).toBe(656)
  })

  it('is used by the Clip and the Veto bar, and by nothing else under app/ but those two', () => {
    expect(read('app/components/ClipOverlay.vue')).toContain('sideways:w-[calc(100%-30px-var(--cp-veto-side-w))]')
    expect(read('app/components/VetoBar.vue')).toContain('sideways:w-(--cp-veto-side-w)')
  })
})
