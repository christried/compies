import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// ADR 0019, #454: the notes editor (Tiptap and ProseMirror with it) loads through a dynamic import only, where a note is edited, so no page's first load names it: not the
// library list, not the Event page (its create sheet holds the game form), not the form's own route before the field mounts. Smoke test against the production build:
// run `pnpm test:build` (builds first). The client chunks are minified and hashed, so the test reads them as text: an editor chunk is one that holds the editor component
// (its `data-notes-editor` marker) or ProseMirror's own code (its `ProseMirror` class name).
const CHUNKS = resolve(import.meta.dirname, '../../.output/public/_nuxt')
const SERVER = resolve(import.meta.dirname, '../../.output/server')
const chunks = existsSync(CHUNKS)
  ? readdirSync(CHUNKS).filter(file => file.endsWith('.js')).map(file => ({ file, code: readFileSync(resolve(CHUNKS, file), 'utf8') }))
  : []
const editorChunks = chunks.filter(chunk => chunk.code.includes('data-notes-editor') || chunk.code.includes('ProseMirror'))
const others = chunks.filter(chunk => !editorChunks.includes(chunk))

const dynamicImportOf = (file: string) => (chunk: { code: string }) => chunk.code.includes(`import(\`./${file}\`)`) || chunk.code.includes(`import("./${file}")`)
// `import{a}from"./x.js"`, `import"./x.js"`, `export*from"./x.js"`; a dynamic `import(…)` has a parenthesis and doesn't match.
const staticImportOf = (file: string) => {
  const pattern = new RegExp(`(?:from|import)\\s*["'\`]\\./${file.replace('.', '\\.')}["'\`]`)
  return (chunk: { code: string }) => pattern.test(chunk.code)
}

describe('the notes editor in the build', () => {
  // Guards against a vacuous pass: the editor is tree-shaken out when nothing uses it, and then there is nothing to check.
  it('is in the build: the component and ProseMirror, in chunks of their own', () => {
    expect(editorChunks.length).toBeGreaterThan(0)
    expect(editorChunks.some(chunk => chunk.code.includes('data-notes-editor'))).toBe(true)
    expect(editorChunks.some(chunk => chunk.code.includes('ProseMirror'))).toBe(true)
  })

  it('is reached through a dynamic import from outside its own chunks', () => {
    const reached = editorChunks.filter(chunk => others.some(dynamicImportOf(chunk.file)))
    expect(reached.length).toBeGreaterThan(0)
    // The component's chunk is the one the lazy component asks for.
    expect(reached.some(chunk => chunk.code.includes('data-notes-editor'))).toBe(true)
  })

  it('is not statically imported by any chunk that is not one of its own, the entry and every chunk a first load pulls in included', () => {
    for (const chunk of editorChunks) {
      expect(others.filter(staticImportOf(chunk.file)).map(other => other.file), chunk.file).toEqual([])
    }
  })
})

// A dynamic import's chunk is a prefetch hint on every page whose modules reach the `import()` (the Event page reaches it through the stepper's create sheet).
// The hints are made at render time by vue-bundle-renderer from the build's precomputed manifest; this asks it for a render that used every module of the build,
// which is every page at once, but the editor's own.
describe('the notes editor hints in the rendered page', () => {
  it('has no prefetch or preload link for an editor chunk, whichever modules a page used', async () => {
    const { createRendererContext, getPreloadLinks, getPrefetchLinks } = await import(pathToFileURL(resolve(SERVER, 'node_modules/vue-bundle-renderer/dist/runtime.mjs')).href)
    const precomputed = (await import(pathToFileURL(resolve(SERVER, 'chunks/virtual/precomputed.mjs')).href)).default
    const rendererContext = createRendererContext({ precomputed })
    const editorFiles = new Set(editorChunks.map(chunk => chunk.file))
    const own = ([id, module]: [string, { file: string }]) => editorFiles.has(module.file) || /RichNotes|notes-extensions/.test(id)
    const used = Object.entries<{ file: string }>(precomputed.modules).filter(entry => !own(entry)).map(([id]) => id)
    const ssrContext = { modules: new Set(used) }

    const links: { rel: string, href: string }[] = [...getPreloadLinks(ssrContext, rendererContext), ...getPrefetchLinks(ssrContext, rendererContext)]
    // Guards against a vacuous pass: the same render does produce hints for the other chunks.
    expect(links.length).toBeGreaterThan(0)
    expect(links.filter(link => [...editorFiles].some(file => link.href.endsWith(`/${file}`) || /RichNotes/.test(link.href)))).toEqual([])
  })
})
