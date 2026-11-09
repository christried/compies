import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// „System“ is CSS only (#402): `<html data-theme="system">` draws the dark set under `@media (prefers-color-scheme: dark)`
// and the light set otherwise, with no script. So every `[data-theme=dark]` rule has a `[data-theme=system]` twin under that
// media query. The seam is the stylesheet as text: the DOM test environments compute neither media queries nor cascade order.
const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const tokens = read('app/assets/css/compies-tokens.css')

const DARK_MEDIA = /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/g
const PAPER = '--cp-paper: #17121d;'

/** Comments do not count. */
const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
/** `[data-theme="dark"]` and `[data-theme=dark]` read alike, and whitespace does not count. */
const normalise = (text: string) => text.replace(/\[data-theme="(\w+)"\]/g, '[data-theme=$1]').replace(/\s+/g, ' ').trim()

/** Splits CSS into what stands inside its `@media (prefers-color-scheme: dark)` blocks and what stands outside. */
function splitDarkMedia(css: string): { inside: string, outside: string } {
  let inside = ''
  let outside = ''
  let from = 0
  for (const match of css.matchAll(DARK_MEDIA)) {
    if (match.index < from) continue
    const open = match.index + match[0].length
    let depth = 1
    let i = open
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    outside += css.slice(from, match.index)
    inside += `${css.slice(open, i - 1)}\n`
    from = i
  }
  return { inside, outside: outside + css.slice(from) }
}

/** A rule body as name → value. A bare at-rule like `@slot` counts as a name with an empty value. */
function declarations(body: string): Record<string, string> {
  return Object.fromEntries(body.split(';').map(d => d.trim()).filter(Boolean).map((d) => {
    const colon = d.indexOf(':')
    return colon < 0 ? [d, ''] : [d.slice(0, colon).trim(), normalise(d.slice(colon + 1))]
  }))
}

/** Every innermost rule whose selector names `data-theme=<value>`: normalised selector → its declarations. */
function rulesFor(css: string, value: 'dark' | 'system'): Map<string, Record<string, string>> {
  const found = new Map<string, Record<string, string>>()
  for (const [, selector = '', body = ''] of css.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
    const name = normalise(selector)
    if (name.includes(`[data-theme=${value}]`)) found.set(name, declarations(body))
  }
  return found
}

const sameRule = (a: Record<string, string>, b: Record<string, string> | undefined) =>
  b !== undefined && JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

/** The dark rules of one stylesheet that have no equal `[data-theme=system]` twin under the dark media query. */
function twinGaps(css: string): string[] {
  const { inside, outside } = splitDarkMedia(clean(css))
  const twins = rulesFor(inside, 'system')
  return [...rulesFor(outside, 'dark')]
    .filter(([selector, body]) => !sameRule(body, twins.get(selector.replaceAll('[data-theme=dark]', '[data-theme=system]'))))
    .map(([selector]) => selector)
}

/** The dark token block, and its System twin under the dark media query. */
function tokenBlocks(css: string) {
  const { inside, outside } = splitDarkMedia(clean(css))
  return { dark: rulesFor(outside, 'dark').get('[data-theme=dark]') ?? {}, system: rulesFor(inside, 'system').get('[data-theme=system]') }
}

describe('the System twin of the dark tokens (#402)', () => {
  const { dark, system } = tokenBlocks(tokens)

  it('has every dark token with the same value', () => {
    expect(Object.keys(dark)).toEqual(expect.arrayContaining(['color-scheme', '--cp-paper', '--cp-shadow-card', '--cp-sticker-shadow']))
    expect(system).toEqual(dark)
  })

  it('comes after the light and the dark block, so it wins over :root by order', () => {
    const css = clean(tokens)
    const twin = css.indexOf('[data-theme="system"]')
    expect(twin).toBeGreaterThan(css.indexOf(':root, [data-theme="light"]'))
    expect(twin).toBeGreaterThan(css.indexOf('[data-theme="dark"]'))
  })

  it('fails when a dark token is changed in only one of the two blocks', () => {
    expect(tokens.split(PAPER)).toHaveLength(3)
    expect(twinGaps(tokens)).toEqual([])

    const darkOnly = tokens.replace(PAPER, '--cp-paper: #000000;')
    expect(twinGaps(darkOnly)).toEqual(['[data-theme=dark]'])

    const last = tokens.lastIndexOf(PAPER)
    const systemOnly = `${tokens.slice(0, last)}--cp-paper: #000000;${tokens.slice(last + PAPER.length)}`
    expect(twinGaps(systemOnly)).toEqual(['[data-theme=dark]'])
  })
})

describe('twinGaps', () => {
  it('reports a dark rule without a twin', () => {
    expect(twinGaps('[data-theme=dark] .x { color: red; }')).toEqual(['[data-theme=dark] .x'])
  })

  it('accepts a dark rule with its twin under the dark media query', () => {
    expect(twinGaps('[data-theme=dark] .x { color: red; } @media (prefers-color-scheme: dark) { [data-theme=system] .x { color: red; } }')).toEqual([])
  })

  it('reports a dark rule whose twin stands outside the dark media query', () => {
    expect(twinGaps('[data-theme=dark] .x { color: red; } [data-theme=system] .x { color: red; }')).toEqual(['[data-theme=dark] .x'])
  })
})
