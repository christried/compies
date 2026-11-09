import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The built page carries its Appearance from the first byte (#401): a visitor without a User gets `data-theme="light"` and the
// one light browser bar colour in the server-rendered HTML, before any script runs. The built server runs without a database:
// a signed-out request never opens one (Better Auth finds no login session cookie, and the Pool connects only on a query).
// Run `pnpm test:build` (builds first).
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

describe('Appearance in the built page', () => {
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

  it('renders a visitor without a User light, with the one light theme-color meta', async () => {
    const response = await fetch(`${origin}/anmelden`)
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toMatch(/<html[^>]*\sdata-theme="light"/)
    const metas = html.match(/<meta[^>]*name="theme-color"[^>]*>/g) ?? []
    expect(metas).toHaveLength(1)
    expect(metas[0]).toContain('content="#fff3df"')
    expect(metas[0]).not.toContain('media=')
  })
})
