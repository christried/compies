import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rigMarkup } from '../../app/utils/compibert-rig'

// The rig's SVG text for one instance (#311): per-instance ids, open lids and the variant's own viewBox. Pure text in, text out.
const asset = (name: string) => readFileSync(resolve(import.meta.dirname, `../../app/assets/compibert/compibert-${name}.svg`), 'utf8')
const FULL = asset('full')
const HEAD = asset('head')

const idsOf = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]!)

describe('rigMarkup', () => {
  it('removes the element ids of the asset, which would repeat on a page with two instances', () => {
    const svg = rigMarkup(FULL, 'full', 'cbA_')

    expect(svg).not.toMatch(/id="compibert/)
    expect(svg).toContain('class="compibert-root"')
  })

  it('prefixes the filter and clip path ids and every reference to them', () => {
    const svg = rigMarkup(FULL, 'full', 'cbA_')

    expect(idsOf(svg)).toEqual(expect.arrayContaining(['cbA_stk', 'cbA_hrd', 'cbA_bb', 'cbA_cleft']))
    expect(svg).not.toMatch(/id="cb_/)
    const references = [...svg.matchAll(/url\(#([^)]+)\)/g)].map(match => match[1]!)
    expect(references.length).toBeGreaterThan(0)
    for (const reference of references) expect(reference).toMatch(/^cbA_/)
  })

  it('gives two prefixes disjoint ids', () => {
    const first = idsOf(rigMarkup(FULL, 'full', 'cbA_'))
    const second = idsOf(rigMarkup(FULL, 'full', 'cbB_'))

    expect(first.length).toBeGreaterThan(0)
    expect(first.filter(id => second.includes(id))).toEqual([])
  })

  it('opens the lids before GSAP is there', () => {
    for (const [source, variant] of [[FULL, 'full'], [HEAD, 'head']] as const) {
      const svg = rigMarkup(source, variant, 'cbA_')

      expect(svg).toContain('<rect transform="translate(0 -58.4)" class="compibert-lid-left"')
    }
  })

  it('crops each variant to its own viewBox and fills its container', () => {
    expect(rigMarkup(FULL, 'full', 'cbA_')).toContain('viewBox="0 36 404 344" width="100%" height="100%"')
    expect(rigMarkup(HEAD, 'head', 'cbA_')).toContain('viewBox="212 40 192 192" width="100%" height="100%"')
  })
})
