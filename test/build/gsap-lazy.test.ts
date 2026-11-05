import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ADR 0015: GSAP loads through `loadGsap()` (a dynamic import) only, so a page without a rig or a ceremony never downloads it.
// Smoke test against the production build: run `pnpm test:build` (builds first). The client chunks are minified and hashed, so the test
// reads them as text: the GSAP chunk is the one with GSAP's own `_gsap` property, and no chunk may import it statically.
const CHUNKS = resolve(import.meta.dirname, '../../.output/public/_nuxt')
const chunks = existsSync(CHUNKS)
  ? readdirSync(CHUNKS).filter(file => file.endsWith('.js')).map(file => ({ file, code: readFileSync(resolve(CHUNKS, file), 'utf8') }))
  : []
const gsapChunk = chunks.find(chunk => chunk.code.includes('_gsap'))

// Without a consumer GSAP is tree-shaken out of the build and there is nothing to check; the ceremony's end frame (#311 Part B) is the first
// consumer, and removes this guard. Until then the build has no GSAP chunk and the test would be vacuous.
describe.skipIf(!gsapChunk)('GSAP in the build', () => {
  it('sits in a chunk of its own that is reached through a dynamic import', () => {
    const file = gsapChunk!.file

    // `import(` in the bundle is how the loader asks for it: `import(`./x.js`)`.
    const dynamic = chunks.filter(chunk => chunk.code.includes(`import(\`./${file}\`)`) || chunk.code.includes(`import("./${file}")`))
    expect(dynamic.length).toBeGreaterThan(0)
  })

  it('is not statically imported by any chunk, the entry and everything it pulls in included', () => {
    const file = gsapChunk!.file
    // `import{a}from"./x.js"`, `import"./x.js"`, `export*from"./x.js"`; a dynamic `import(…)` has a parenthesis and doesn't match.
    const staticImport = new RegExp(`(?:from|import)\\s*["'\`]\\./${file.replace('.', '\\.')}["'\`]`)

    expect(chunks.filter(chunk => staticImport.test(chunk.code)).map(chunk => chunk.file)).toEqual([])
  })
})
