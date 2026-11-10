import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, clean, darkVariant, normalise, tokens } from './css-tokens'

// „System“ is CSS only (#402): `<html data-theme="system">` draws the dark set under `@media (prefers-color-scheme: dark)`
// and the light set otherwise, with no script. So every `[data-theme=dark]` rule has a `[data-theme=system]` twin under that
// media query. The seam is the stylesheet as text: the DOM test environments compute neither media queries nor cascade order.
const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const offlinePage = read('public/offline.html')

const DARK_MEDIA = /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/g
const PAPER = '--cp-paper: #17121d;'

/** Every `.css` and `.vue` file under a directory, as paths relative to the repo root. */
function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(css|vue)$/.test(entry.name) ? [path] : []
  })
}

/** The CSS of a file: a `.css` file whole, a Vue file's `<style>` blocks. */
const stylesOf = (path: string, text: string) =>
  path.endsWith('.vue') ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') : text

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

describe('the stylesheets under app/', () => {
  const files = sourceFiles('app').map(path => ({ path, css: stylesOf(path, read(path)) }))

  it('give every dark rule its System twin, in the same file (#402)', () => {
    const withDark = files.filter(f => rulesFor(splitDarkMedia(clean(f.css)).outside, 'dark').size > 0).map(f => f.path)
    expect(withDark).toEqual(expect.arrayContaining([
      'app/assets/css/compies-tokens.css',
      'app/assets/css/compies-theme.css',
      'app/components/Compibert.vue',
      'app/components/CompibertRig.vue',
    ]))
    expect(files.flatMap(f => twinGaps(f.css).map(selector => `${f.path}: ${selector}`))).toEqual([])
  })

  it('never draw System dark on a device that asks for light (#402)', () => {
    const outside = files.filter(f => rulesFor(splitDarkMedia(clean(f.css)).outside, 'system').size > 0).map(f => f.path)
    expect(outside).toEqual([])
  })
})

describe('the offline page', () => {
  // It has no User and no cookie to read, so it always follows the device (#402).
  const { dark } = tokenBlocks(tokens)
  const style = offlinePage.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const offline = declarations(splitDarkMedia(clean(style)).inside.match(/:root\s*\{([^{}]*)\}/)?.[1] ?? '')

  it('follows a device that asks for dark with the dark tokens (#402)', () => {
    expect(offline['color-scheme']).toBe('dark')
    const names = Object.keys(offline).filter(name => name.startsWith('--'))
    expect(names.length).toBeGreaterThanOrEqual(8)
    for (const name of names) expect(offline[name], name).toBe(dark[`--cp-${name.slice(2)}`])
  })

  it('colours the browser bar with the dark page background under the dark media query (#402)', () => {
    expect(dark['--cp-paper']).toBe('#17121d')
    expect(offlinePage).toContain('<meta name="theme-color" content="#17121d" media="(prefers-color-scheme: dark)">')
  })
})

describe('the dark: variant', () => {
  // Tailwind's own compiler is the seam: it shows what a `dark:` utility really emits.
  it('gives every dark: utility its System twin under the dark media query (#402)', async () => {
    expect(darkVariant).toBeDefined()

    const css = await build('@theme { --color-ink: #151515; }', ['dark:bg-ink'])
    expect(css).toContain('.dark\\:bg-ink:where([data-theme=dark], [data-theme=dark] *) { background-color: var(--color-ink); }')
    expect(css).toContain('@media (prefers-color-scheme: dark) { .dark\\:bg-ink:where([data-theme=system], [data-theme=system] *) { background-color: var(--color-ink); } }')
  })
})
