import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// ADR 0015: GSAP loads through `loadGsap()` (a dynamic import) only, so a page without a rig or a ceremony never downloads it.
// Smoke test against the production build: run `pnpm test:build` (builds first). The client chunks are minified and hashed, so the test
// reads them as text: the GSAP chunk is the one with GSAP's own `_gsap` property, and no chunk may import it statically.
const CHUNKS = resolve(import.meta.dirname, '../../.output/public/_nuxt')
const chunks = existsSync(CHUNKS)
  ? readdirSync(CHUNKS).filter(file => file.endsWith('.js')).map(file => ({ file, code: readFileSync(resolve(CHUNKS, file), 'utf8') }))
  : []
const gsapChunk = chunks.find(chunk => chunk.code.includes('_gsap'))

describe('GSAP in the build', () => {
  // Guards against a vacuous pass: GSAP is tree-shaken out when nothing uses the loader, and then there is nothing to check.
  it('is in the build, since the end frame of the ceremony uses the rig', () => {
    expect(gsapChunk).toBeDefined()
  })

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

// A dynamic import's chunk is, by default, a prefetch hint on every page whose modules reach the `import()`: the Event page reaches
// `loadGsap()` through the ceremony layer, so a finished Event's page fetched 70 kB of GSAP although no run plays (#308, browser check).
// The hints are made at render time by vue-bundle-renderer from the build's precomputed manifest; this asks it for a render that used every
// module of the build, which is every page at once.
describe('GSAP hints in the rendered page', () => {
  const SERVER = resolve(import.meta.dirname, '../../.output/server')

  it('has no prefetch or preload link for the GSAP chunk, whichever modules a page used', async () => {
    const { createRendererContext, getPreloadLinks, getPrefetchLinks } = await import(pathToFileURL(resolve(SERVER, 'node_modules/vue-bundle-renderer/dist/runtime.mjs')).href)
    const precomputed = (await import(pathToFileURL(resolve(SERVER, 'chunks/virtual/precomputed.mjs')).href)).default
    const rendererContext = createRendererContext({ precomputed })
    // Every module but GSAP's own: no page renders it (the first test shows nothing imports it statically).
    const used = Object.entries<{ file: string }>(precomputed.modules).filter(([, module]) => module.file !== gsapChunk!.file).map(([id]) => id)
    const ssrContext = { modules: new Set(used) }

    const links: { rel: string, href: string }[] = [...getPreloadLinks(ssrContext, rendererContext), ...getPrefetchLinks(ssrContext, rendererContext)]
    // Guards against a vacuous pass: the same render does produce hints for the other chunks.
    expect(links.length).toBeGreaterThan(0)
    expect(links.filter(link => link.href.endsWith(`/${gsapChunk!.file}`))).toEqual([])
  })
})
