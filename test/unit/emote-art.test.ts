import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMOTE_PICTURE } from '../../app/utils/emote-art'
import { EMOTE_IDS } from '../../shared/emote'

// The four Emote pictures (#668) are static files under `public/emotes/`, drawn as <img> and never inlined: an <img> runs no script, and each file
// reuses the ids `disc` and a clip id of its own. The files carry about 7.5 KB of inert provenance (`<metadata>`); the test keeps the rest free of
// anything active, so a file swapped in later cannot bring a script, a link or a remote picture.
const publicFolder = resolve(import.meta.dirname, '../../public')
const fileOf = (picture: string) => resolve(publicFolder, picture.replace(/^\//, ''))
const withoutMetadata = (svg: string) => svg.replace(/<metadata[\s\S]*?<\/metadata>/g, '')

describe('the Emote pictures', () => {
  it.each(EMOTE_IDS)('has a file under public/emotes/ for %s', (id) => {
    const picture = EMOTE_PICTURE[id]
    expect(picture).toMatch(/^\/emotes\/emote-[a-z]+\.svg$/)
    expect(existsSync(fileOf(picture))).toBe(true)
  })

  it('has one picture per Emote, each its own', () => {
    expect(Object.keys(EMOTE_PICTURE).sort()).toEqual([...EMOTE_IDS].sort())
    expect(new Set(Object.values(EMOTE_PICTURE)).size).toBe(EMOTE_IDS.length)
  })

  it.each(EMOTE_IDS)('keeps %s free of script, links and remote pictures', (id) => {
    const svg = withoutMetadata(readFileSync(fileOf(EMOTE_PICTURE[id]), 'utf8'))
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/\son\w+=/i)
    expect(svg).not.toMatch(/href/i)
    expect(svg).not.toMatch(/<image/i)
    expect(svg).not.toMatch(/<foreignObject/i)
    expect(svg).not.toMatch(/url\((?!#)/i)
    // The only URLs left are the two namespace declarations (the SVG's, and the provenance manifest's `xmlns:c2pa` on the root).
    const namespaces = ['http://www.w3.org/2000/svg', 'http://c2pa.org/manifest']
    expect([...svg.matchAll(/https?:\/\/[^\s"')]+/g)].map(match => match[0]).filter(url => !namespaces.includes(url))).toEqual([])
  })
})
