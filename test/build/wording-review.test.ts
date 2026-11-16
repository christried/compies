import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The wording review page and its server (scripts/wording/review.mjs, #631) are a tool of the repo: no build carries them. Nothing under
// app/, server/ or shared/ imports or names them, so neither Nuxt's client nor Nitro's server bundle can reach them. Run `pnpm test:build`
// (builds first; CI builds production); the build is not run on a shared machine (#627).
const OUTPUT = resolve(import.meta.dirname, '../../.output')
const TEXT = /\.(mjs|js|json|html|map)$/

const carriers = (matches: (text: string) => boolean) => readdirSync(OUTPUT, { recursive: true, encoding: 'utf8' })
  .map(file => file.replaceAll('\\', '/'))
  .filter(file => TEXT.test(file))
  // A folder can end in .js too (a package's own folder under .output/server/node_modules).
  .filter(file => statSync(join(OUTPUT, file)).isFile())
  .filter(file => matches(readFileSync(join(OUTPUT, file), 'utf8')))

describe('the wording review in the production build', () => {
  it('has the build to read', () => {
    expect(readdirSync(OUTPUT).length).toBeGreaterThan(0)
  })

  it('has no page script in any script, page or map', () => {
    expect(carriers(text => text.includes('compies-wording-review'))).toEqual([])
  })

  it('has no server in any script, page or map', () => {
    expect(carriers(text => text.includes('review-server'))).toEqual([])
  })

  it('has no answer route in any script, page or map', () => {
    expect(carriers(text => text.includes('/api/answer'))).toEqual([])
  })
})
