import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The built page carries Reduced motion from the first byte (#680, GLOSSARY: Reduced motion): a signed-out request with the device's
// `compies-motion` cookie gets `data-motion="reduced"` on <html> in the server-rendered HTML, before any script runs, and one without
// the cookie gets no `data-motion`. The built server runs without a database, as in appearance.test.ts (#401). Run `pnpm test:build`.
const SERVER = resolve(import.meta.dirname, '../../.output/server/index.mjs')

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

describe('Reduced motion in the built page', () => {
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

  async function anmeldenWith(cookie?: string) {
    const response = await fetch(`${origin}/anmelden`, cookie ? { headers: { cookie } } : undefined)
    expect(response.status).toBe(200)
    // The page render only reads the cookie and never writes it.
    expect(response.headers.getSetCookie().find(line => line.startsWith('compies-motion='))).toBeUndefined()
    return response.text()
  }

  it('renders a signed-out visitor with the cookie calm, in the first byte', async () => {
    expect(await anmeldenWith('compies-motion=reduced')).toMatch(/<html[^>]*\sdata-motion="reduced"/)
  })

  it('renders a visitor without the cookie with no data-motion', async () => {
    expect(await anmeldenWith()).not.toMatch(/<html[^>]*data-motion/)
  })

  it.each(['compies-motion=full', 'compies-motion=', 'compies-motion=1'])('renders a visitor with only %s with no data-motion', async (cookie) => {
    expect(await anmeldenWith(cookie)).not.toMatch(/<html[^>]*data-motion/)
  })
})
