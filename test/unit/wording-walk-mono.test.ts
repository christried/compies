import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The wording walk's table of `font-mono` uses (MONO_USES, scripts/wording/walk.mjs) names every line of app/ that sets the mono font, so the
// walk's report sees each one (#629). walk.mjs is a script the tests do not import: they read its text, as the walk's own rows are written.
const ROOT = resolve(import.meta.dirname, '../..')

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('the walk’s table of font-mono uses', () => {
  // Per file, not in all: a use that moved to another file is caught too. The rows name no line number, which went stale
  // twice in 0.16.1 while the count still held (#833).
  it('has as many rows for each file of app/ as the file has lines that set font-mono, and no row names a line number', () => {
    const walk = readFileSync(join(ROOT, 'scripts/wording/walk.mjs'), 'utf8')
    const rows = walk.split('\n').filter(line => /^ {2}\{ site: /.test(line))
    const count = (names: string[]) => names.reduce<Record<string, number>>((counts, name) => ({ ...counts, [name]: (counts[name] ?? 0) + 1 }), {})
    const rowFiles = rows.map(line => line.match(/component: '(app\/[^']+)'/)?.[1] ?? '')
    const useFiles = vueFiles(join(ROOT, 'app')).flatMap(file => readFileSync(file, 'utf8').split('\n')
      .filter(line => line.includes('font-mono'))
      .map(() => file.slice(ROOT.length + 1).replaceAll('\\', '/')))
    expect(count(rowFiles)).toEqual(count(useFiles))
    expect(rows.filter(line => /site: '[^']*\.vue:\d/.test(line))).toEqual([])
  })

  // An untagged mono element (`entry: true`) is labelled by MONO_WHAT, else the report calls its component unlabelled; keyed rows are not.
  it('labels the component of every untagged mono row in MONO_WHAT, so the report does not call it unlabelled', () => {
    const walk = readFileSync(join(ROOT, 'scripts/wording/walk.mjs'), 'utf8')
    const table = walk.match(/const MONO_WHAT = \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const labelled = [...table.matchAll(/'(app\/[^']+)':/g)].map(match => match[1])
    const untagged = walk.split('\n').filter(line => /^ {2}\{ site: /.test(line) && line.includes('entry: true'))
      .map(line => line.match(/component: '(app\/[^']+)'/)?.[1] ?? '')
    expect([...new Set(untagged)].filter(component => !labelled.includes(component))).toEqual([])
  })
})
