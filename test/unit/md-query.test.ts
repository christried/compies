import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MD_QUERY } from '../../app/composables/useMediaQuery'

// The md breakpoint is spelled once, in `MD_QUERY`, and pinned to the theme's `--breakpoint-md` so the two cannot drift (#368).
const root = resolve(import.meta.dirname, '../..')
const theme = readFileSync(resolve(root, 'app/assets/css/compies-theme.css'), 'utf8')
const breakpoint = theme.match(/--breakpoint-md:\s*([\d.]+rem)\s*;/)?.[1]
const home = 'app/composables/useMediaQuery.ts'

/** Every `.ts` and `.vue` file under a directory, as paths relative to the repo root. */
function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|vue)$/.test(entry.name) ? [path] : []
  })
}

describe('the md media query', () => {
  it('is the theme breakpoint --breakpoint-md, as a min-width query', () => {
    expect(breakpoint).toBeDefined()
    expect(MD_QUERY).toBe(`(min-width: ${breakpoint})`)
  })

  it('is spelled only in its home under app/', () => {
    const spelled = `(min-width: ${breakpoint})`
    const others = sourceFiles('app').filter(file => file !== home && readFileSync(join(root, file), 'utf8').includes(spelled))
    expect(others).toEqual([])
  })
})
