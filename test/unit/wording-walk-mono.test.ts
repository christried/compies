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
  it('has one row for every line of app/ that sets font-mono', () => {
    const walk = readFileSync(join(ROOT, 'scripts/wording/walk.mjs'), 'utf8')
    const rows = walk.match(/^ {2}\{ site: /gm) ?? []
    const lines = vueFiles(join(ROOT, 'app'))
      .flatMap(file => readFileSync(file, 'utf8').split('\n'))
      .filter(line => line.includes('font-mono'))
    expect(rows.length).toBe(lines.length)
  })
})
