import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clean, light, normalise, tokens } from './css-tokens'

// The offline page is one static file the service worker serves when a navigation fails, so a browser computes
// nothing here: like copy.test.ts and system-appearance.test.ts, it is pinned as text (#808). Its look is that of
// FullScreenState.vue (kind `invalid`, „Link ungültig“); the numbers are read from the component, so a change of
// either file turns this red.
const read = (path: string) => readFileSync(resolve(import.meta.dirname, `../../${path}`), 'utf8')
const page = read('public/offline.html')
const component = read('app/components/FullScreenState.vue')

const style = clean(page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '')
/** The page's own `@media (min-width: 61.25rem)` block (`md`, 980 px) and everything outside every media block. */
const wide = style.match(/@media \(min-width: 61\.25rem\) \{([\s\S]*?\})\s*\}/)?.[1] ?? ''
const outsideMedia = style.replace(/@media [^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '')

/** The declarations of the first rule for `selector` in `css`, longhand by name. */
function rule(css: string, selector: string): Record<string, string> {
  const body = css.match(new RegExp(`(?:^|[\\s}])${selector}\\s*\\{([^{}]*)\\}`))?.[1] ?? ''
  return Object.fromEntries(body.split(';').map(d => d.trim()).filter(Boolean).map((d) => {
    const colon = d.indexOf(':')
    return [d.slice(0, colon).trim(), normalise(d.slice(colon + 1))]
  }))
}
const px = (value: string | undefined) => Number(/^(\d+(?:\.\d+)?)px$/.exec(value ?? '')?.[1])
const fromComponent = (pattern: RegExp) => Number(pattern.exec(component)?.[1])
const token = (block: string, name: string) => normalise(block.match(new RegExp(`--cp-${name}:\\s*([^;]+);`))?.[1] ?? '')

describe('the offline page takes the look of „Link ungültig“ (#808)', () => {
  it('loads nothing from the network: the precached favicon link is the only reference', () => {
    const refs = [...page.matchAll(/\b(?:src|href|srcset)\s*=\s*"([^"]*)"|url\(([^)]*)\)|@import[^;]*/g)].map(m => m[0])
    expect(refs).toEqual(['href="/icons/favicon.svg"'])
    expect(page).not.toMatch(/<img|<script|<iframe|rel="stylesheet"|https?:/i)
  })

  it('draws the head inline, as a static copy of the asset', () => {
    expect(page.match(/<svg/g)).toHaveLength(1)
    expect(page).toContain('viewBox="212 40 192 192"')
    expect(page).toContain('aria-hidden="true"')
    expect((page.match(/<path/g) ?? []).length).toBeGreaterThan(3)
    expect(page).not.toMatch(/\bid=|var\(--cb-|opacity:\s*0(?![.\d])|<filter|<clipPath|<defs/i)
  })

  it('takes the measures of FullScreenState.vue', () => {
    expect(px(rule(outsideMedia, 'svg').width)).toBe(fromComponent(/"w-\[(\d+)px\]/))
    expect(px(rule(outsideMedia, 'h1')['font-size'])).toBe(fromComponent(/text-\[(\d+)px\] leading-none/))
    expect(px(rule(wide, 'h1')['font-size'])).toBe(fromComponent(/md:text-\[(\d+)px\]/))
    expect(px(rule(outsideMedia, 'main')['max-width'])).toBe(fromComponent(/max-w-\[(\d+)px\]/))
    expect(px(rule(outsideMedia, 'p')['font-size'])).toBe(fromComponent(/<p class="[^"]*text-\[(\d+)px\]/))
  })

  it('follows the tokens in fonts and light colours', () => {
    expect(rule(outsideMedia, 'h1')['font-family']).toBe(token(tokens, 'font-display'))
    expect(rule(outsideMedia, 'body')['font-family']).toBe(token(tokens, 'font-sans'))
    const root = rule(outsideMedia, ':root')
    for (const name of ['paper', 'ink', 'ink-2', 'primary', 'on-primary', 'tex-image', 'tex-size']) {
      expect(root[`--${name}`], name).toBe(token(light, name))
    }
  })

  it('keeps the four texts word for word', () => {
    const text = (pattern: RegExp) => pattern.exec(page)?.[1]?.trim()
    expect(text(/<title>([^<]*)<\/title>/)).toBe('Compies')
    expect(text(/<h1>([^<]*)<\/h1>/)).toBe('Keine Verbindung.')
    expect(text(/<p>([^<]*)<\/p>/)).toBe('Wir warten, bis du wieder online bist. Dann geht’s hier weiter.')
    expect(text(/<button[^>]*>([^<]*)<\/button>/)).toBe('Seite neu laden')
  })

  it('has no card around the content', () => {
    expect(style).not.toContain('border-radius: 20px')
    expect(style).not.toContain('--surface')
  })
})
