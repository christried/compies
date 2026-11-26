import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The installed app's splash in the built page (#674, spec #927). The built server runs without a database, so a signed-in request cannot be made
// here: the signed-in first byte (the layer for `/`, signed in, without the cookie) is pinned by the unit matrix of `bootSplashDue` and the Nuxt
// wiring test. What a database-less build can show is the other half: the layer is not in a signed-out first byte, the stylesheet keeps it
// away from a browser tab, and no page prefetches its chunk. Run `pnpm test:build`.
const OUTPUT = resolve(import.meta.dirname, '../../.output')
const SERVER = resolve(OUTPUT, 'server/index.mjs')
const ASSETS = resolve(OUTPUT, 'public/_nuxt')

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, () => {
      const address = probe.address()
      probe.close(() => typeof address === 'object' && address ? done(address.port) : fail(new Error('no port')))
    })
  })
}

const files = (extension: string) => existsSync(ASSETS)
  ? readdirSync(ASSETS).filter(file => file.endsWith(extension)).map(file => ({ file, code: readFileSync(resolve(ASSETS, file), 'utf8') }))
  : []

describe('the splash in the built page', () => {
  let server: ChildProcess
  let origin: string

  beforeAll(async () => {
    const port = await freePort()
    origin = `http://localhost:${port}`
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      BETTER_AUTH_URL: origin,
    }
    delete env.DATABASE_URL
    server = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'ignore', 'pipe'] })
    let errors = ''
    server.stderr?.on('data', (chunk: Buffer) => errors += chunk.toString())

    const until = Date.now() + 20_000
    for (;;) {
      try {
        if ((await fetch(`${origin}/anmelden`)).ok) return
      }
      catch {
        // Not listening yet.
      }
      if (Date.now() > until) throw new Error(`the built server did not answer /anmelden within 20 s\n${errors}`)
      await new Promise(next => setTimeout(next, 250))
    }
  }, 30_000)

  afterAll(() => {
    server?.kill()
  })

  async function page(path: string, cookie?: string) {
    const response = await fetch(`${origin}${path}`, cookie ? { headers: { cookie } } : undefined)
    expect(response.status).toBe(200)
    return { html: await response.text(), url: response.url }
  }

  it.each([undefined, 'compies-boot=seen'])('puts no layer in the first byte of the sign-in page (cookie: %s)', async (cookie) => {
    const { html } = await page('/anmelden', cookie)

    expect(html).toContain('<html')
    expect(html).not.toContain('data-part="boot-splash"')
  })

  it('puts no layer in the page a signed-out visit to Home reaches', async () => {
    const { html, url } = await page('/')

    expect(new URL(url).pathname).toBe('/anmelden')
    expect(html).not.toContain('data-part="boot-splash"')
  })

  it('hides the layer by default and shows it only for the installed app', () => {
    const sheet = files('.css').map(({ code }) => code).find(code => code.includes('.boot-splash'))

    // Guards against a vacuous pass: the layer's styles are in the build.
    expect(sheet).toBeDefined()
    expect(sheet).toMatch(/\.boot-splash\s*\{\s*display:\s*none\s*;?\s*\}/)
    expect(sheet).toMatch(/@media\s*\(display-mode:\s*standalone\)\s*\{\s*\.boot-splash\s*\{\s*display:\s*flex\s*;?\s*\}\s*\}/)
  })

  it('is not prefetched or preloaded by any page: only the installed app\'s first launch needs the chunk', async () => {
    const splash = files('.js').find(({ code }) => code.includes('boot-wrap'))
    // Guards against a vacuous pass: the layer's code is in the build, in a chunk of its own or in one it shares.
    expect(splash).toBeDefined()

    const { createRendererContext, getPreloadLinks, getPrefetchLinks } = await import(pathToFileURL(resolve(OUTPUT, 'server/node_modules/vue-bundle-renderer/dist/runtime.mjs')).href)
    const precomputed = (await import(pathToFileURL(resolve(OUTPUT, 'server/chunks/virtual/precomputed.mjs')).href)).default
    const rendererContext = createRendererContext({ precomputed })
    // A render that used every module of the build, which is every page at once, but not the splash's own.
    const used = Object.entries<{ file: string }>(precomputed.modules).filter(([, module]) => module.file !== splash!.file).map(([id]) => id)
    const ssrContext = { modules: new Set(used) }

    const links: { rel: string, href: string }[] = [...getPreloadLinks(ssrContext, rendererContext), ...getPrefetchLinks(ssrContext, rendererContext)]
    // Guards against a vacuous pass: the same render does produce hints for the other chunks.
    expect(links.length).toBeGreaterThan(0)
    expect(links.filter(link => link.href.endsWith(`/${splash!.file}`))).toEqual([])
  })
})
