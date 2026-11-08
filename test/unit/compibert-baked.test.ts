import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The two baked poses the Share image renders (#313 reads them from the Nitro server assets). CI cannot run the bake itself (it
// needs GSAP stepped by hand); `node scripts/bake-compibert.mjs --check` is the manual guard that the files match the engine.
const DIR = resolve(import.meta.dirname, '../../server/assets/compibert')
const read = (file: string) => readFileSync(resolve(DIR, file), 'utf8')

const FILES = [
  { file: 'compibert-dance.svg', viewBox: '0 36 404 344' },
  { file: 'compibert-head-idle.svg', viewBox: '212 40 192 192' },
]

describe.each(FILES)('baked $file', ({ file, viewBox }) => {
  it('is a self-contained SVG with its view box', () => {
    const svg = read(file)

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain(`viewBox="${viewBox}"`)
    // The renderer sets the size; only the rects inside carry a width.
    expect(svg.match(/^<svg[^>]*>/)?.[0]).not.toMatch(/ (width|height)="/)
  })

  it('has nothing the Share image renderer cannot draw', () => {
    const svg = read(file)

    // An opacity of 0 is a hidden part (the baked file leaves those out); .14 and .8 are the shadow and the cheek.
    expect(svg).not.toMatch(/opacity[:=]"?0(?![.0-9])/)
    for (const leftover of ['filter', 'var(--', 'data-pivot', 'class=', 'id="compibert', 'display:none', 'cb-']) {
      expect(svg, leftover).not.toContain(leftover)
    }
  })

  it('stays small', () => {
    expect(Buffer.byteLength(read(file))).toBeLessThan(40 * 1024)
  })
})

describe('baked pose', () => {
  it('the dance frame has the grin and no other mouth (the hidden ones are left out), the head idle keeps its smile', () => {
    // The grin's inside and the "o" mouth share one fill colour; the smile has none, and its fang is white.
    expect(read('compibert-dance.svg').match(/#5e1631/g)).toHaveLength(1)
    expect(read('compibert-head-idle.svg')).not.toContain('#5e1631')
  })
})
