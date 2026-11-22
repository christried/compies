import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every component that quietens a motion for the device (`motion-reduce:X`) quietens it for the app's own switch too (`reduced:X`,
// #680, GLOSSARY: Reduced motion): the custom variant of compies-theme.css is the attribute's twin of the media query. The seam is
// the component text, as for `motion-utilities`: a test environment computes no utilities.
const COMPONENTS = resolve(import.meta.dirname, '../../app')

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? vueFiles(join(dir, entry.name)) : entry.name.endsWith('.vue') ? [join(dir, entry.name)] : [])
}

describe('motion-reduce: utilities', () => {
  const twinless = vueFiles(COMPONENTS).flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    const lacking = [...text.matchAll(/(?<![\w-])motion-reduce:([^\s'"`]+)/g)]
      .map(match => match[1]!)
      .filter(utility => !new RegExp(`(?<![\\w-])reduced:${utility.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![^\\s'"\`])`).test(text))
    return lacking.map(utility => `${file.slice(COMPONENTS.length + 1)}: motion-reduce:${utility}`)
  })

  it('each has its reduced: twin in the same file, so the switch is as calm as the device (#680)', () => {
    expect(twinless).toEqual([])
  })
})
