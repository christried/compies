import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESVG_WASM_FILE, SHARE_FONTS, SHARE_SVGS } from '../../server/utils/share-assets'

// The Share image's fonts, pictures and WebAssembly ship with the server (#313): Nitro inlines `server/assets/` and the `assets:resvg`
// entry of nuxt.config.ts as one chunk per file under `chunks/raw/`, named after the file, and keeps satori and resvg-wasm as packages.
// A renderer that finds one of them missing fails on the first request, in production only. Run `pnpm test:build` (builds first).
const SERVER = resolve(import.meta.dirname, '../../.output/server')
const RAW = join(SERVER, 'chunks/raw')
const chunkOf = (file: string) => join(RAW, `${basename(file, extname(file))}.mjs`)

describe('the Share image assets in the production build', () => {
  it.each(SHARE_FONTS.map(font => font.file))('carries the font %s', (file) => {
    expect(existsSync(chunkOf(file))).toBe(true)
  })

  it.each(Object.values(SHARE_SVGS))('carries the picture %s', (path) => {
    expect(existsSync(chunkOf(path))).toBe(true)
  })

  it('carries resvg\'s WebAssembly whole', () => {
    // 2.4 MB of binary, about 3.3 MB as the base64 string of its chunk.
    expect(statSync(chunkOf(RESVG_WASM_FILE)).size).toBeGreaterThan(3_000_000)
  })

  it('carries the licence text of each font family', () => {
    const licences = readdirSync(RAW).filter(file => file.startsWith('LICENSE-') && file.endsWith('.mjs'))
    expect(licences.sort()).toEqual(['LICENSE-bricolage-grotesque.mjs', 'LICENSE-bungee.mjs', 'LICENSE-lilita-one.mjs'])
  })

  it.each(['satori', '@resvg/resvg-wasm'])('has the package %s next to the server', (name) => {
    expect(existsSync(join(SERVER, 'node_modules', name, 'package.json'))).toBe(true)
  })
})
