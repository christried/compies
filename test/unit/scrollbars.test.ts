import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clean, colour, dark, light, parse, theme, tokens } from './css-tokens'

// The scrollbars of the app (#706, spec #856 § Implementation Decisions „Scrollbars“): one rule on the root sets the standard
// `scrollbar-color`, the thumb in the ink token and the track transparent, and every scrolling box inherits it. jsdom draws no
// scrollbar, so the rule is pinned at the stylesheet; the look is a browser-check item on a device with classic scrollbars.
const root = parse(clean(theme)).filter(rule => [':root', 'html'].includes(rule.chain.at(-1) ?? ''))

describe('the scrollbars (#706)', () => {
  it('the root rule sets the thumb to the ink token and the track to transparent', () => {
    const declared = root.flatMap(rule => rule.decls).filter(decl => decl.startsWith('scrollbar-color'))

    expect(declared).toEqual(['scrollbar-color: var(--cp-ink) transparent'])
  })

  it('the ink token it reads is set in Hell and in Dunkel, so the bar follows the Appearance', () => {
    expect(colour(light, 'cp-ink')).toBe('#151515')
    expect(colour(dark, 'cp-ink')).toBe('#f7efe1')
    expect(tokens).toContain('--cp-ink:')
  })

  it('leaves the width to the browser: the root rule sets no scrollbar-width', () => {
    const declared = root.flatMap(rule => rule.decls).filter(decl => decl.startsWith('scrollbar-width'))

    expect(declared).toEqual([])
  })

  it('no stylesheet or component writes a ::-webkit-scrollbar rule (it would not reach Firefox and replaces overlay scrollbars on a Mac)', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(css|vue|ts|js)$/.test(entry.name)) files.push(path)
      }
    }
    walk(resolve(import.meta.dirname, '../../app'))

    const hits = files.filter(file => readFileSync(file, 'utf8').includes('webkit-scrollbar'))

    expect(hits).toEqual([])
  })
})
