import type { H3Event } from 'h3'

// Every file the Share image renderer reads (#313), named in one place. They ship with the server (`server/assets/` is Nitro's
// `assets:server` storage; the WASM comes from the resvg package through a `serverAssets` entry in nuxt.config.ts), so the picture
// needs no network and no third party. ADR 0005: nothing here is Vercel-only.

/**
 * Satori reads TTF, OTF and WOFF, not WOFF2. Each family has its Latin file and its Latin-ext file (Team words are free text: ł, ğ, ő …).
 * The Latin-ext file is registered as its own family, `<name> Ext`: two files under one name make Satori use only the first, and the
 * renderer names both in `fontFamily` (`'Lilita One, Lilita One Ext'`).
 */
export const SHARE_FONTS = [
  { name: 'Lilita One', weight: 400, file: 'lilita-one-latin-400-normal.woff' },
  { name: 'Lilita One Ext', weight: 400, file: 'lilita-one-latin-ext-400-normal.woff' },
  { name: 'Bungee', weight: 400, file: 'bungee-latin-400-normal.woff' },
  { name: 'Bungee Ext', weight: 400, file: 'bungee-latin-ext-400-normal.woff' },
  // @fontsource/bricolage-grotesque@5.3.0 (static weights); the app's own package is the variable one, WOFF2 only, so its files are copied here.
  { name: 'Bricolage Grotesque', weight: 700, file: 'bricolage-grotesque-latin-700-normal.woff' },
  { name: 'Bricolage Grotesque Ext', weight: 700, file: 'bricolage-grotesque-latin-ext-700-normal.woff' },
  { name: 'Bricolage Grotesque', weight: 800, file: 'bricolage-grotesque-latin-800-normal.woff' },
  { name: 'Bricolage Grotesque Ext', weight: 800, file: 'bricolage-grotesque-latin-ext-800-normal.woff' },
] as const

/** The pictures the renderer draws, and where each lives under `server/assets/` (the Compibert stills are baked by scripts/bake-compibert.mjs, #311). */
export const SHARE_SVGS = {
  sunburst: 'share/sunburst.svg',
  dance: 'compibert/compibert-dance.svg',
  head: 'compibert/compibert-head-idle.svg',
} as const
export type ShareSvg = keyof typeof SHARE_SVGS

/** The resvg package's folder as a `serverAssets` base (nuxt.config.ts), and the WASM file in it. */
export const RESVG_ASSETS_BASE = 'resvg'
export const RESVG_WASM_FILE = 'index_bg.wasm'

export interface ShareAssets {
  /** A font file of `SHARE_FONTS`. */
  font(file: string): Promise<Uint8Array>
  /** A picture of `SHARE_SVGS` as text. */
  svg(name: ShareSvg): Promise<string>
  /** resvg's WebAssembly binary. */
  resvgWasm(): Promise<Uint8Array>
}

declare module 'h3' {
  interface H3EventContext {
    shareAssets?: ShareAssets
  }
}

/** Raw storage values come back as a Buffer, an ArrayBuffer or, from an inlined asset, a string. */
function toBytes(value: unknown, what: string): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value === 'string') return new TextEncoder().encode(value)
  throw new Error(`Share image asset missing: ${what}`)
}

// The bytes never change while the process lives, and they are not Event data: one read each.
const memo = new Map<string, Promise<Uint8Array>>()
function once(key: string, read: () => Promise<Uint8Array>): Promise<Uint8Array> {
  let bytes = memo.get(key)
  if (!bytes) {
    bytes = read()
    memo.set(key, bytes)
    // A failed read is tried again by the next request.
    bytes.catch(() => memo.delete(key))
  }
  return bytes
}

/** The assets the Nitro build carries, read through its storage layer. */
function storedShareAssets(): ShareAssets {
  const read = (base: string, key: string) => once(`${base}/${key}`, async () => toBytes(await useStorage(base).getItemRaw(key), `${base}/${key}`))
  return {
    font: file => read('assets:server', `share/fonts/${file}`),
    svg: async name => new TextDecoder().decode(await read('assets:server', SHARE_SVGS[name])),
    resvgWasm: () => read(`assets:${RESVG_ASSETS_BASE}`, RESVG_WASM_FILE),
  }
}

let stored: ShareAssets | undefined

/** The assets of this request: the build's own unless a test put some into the context. */
export function useShareAssets(event: H3Event): ShareAssets {
  return event.context.shareAssets ?? (stored ??= storedShareAssets())
}

/**
 * The same assets read from the source tree, for tests (Nitro's storage layer exists only in a built server).
 * @public Only tests call it, so knip would report it; the test doubles live next to the interface they stand in for.
 */
export function fileShareAssets(): ShareAssets {
  const read = async (path: URL | string) => new Uint8Array(await (await import('node:fs/promises')).readFile(path))
  const assetUrl = (path: string) => new URL(`../assets/${path}`, import.meta.url)
  return {
    font: file => read(assetUrl(`share/fonts/${file}`)),
    svg: async name => new TextDecoder().decode(await read(assetUrl(SHARE_SVGS[name]))),
    resvgWasm: async () => read((await import('node:module')).createRequire(import.meta.url).resolve(`@resvg/resvg-wasm/${RESVG_WASM_FILE}`)),
  }
}
