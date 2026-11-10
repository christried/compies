import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineEventHandler, readRawBody, type EventHandler } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import health from '../../server/api/health.get'
import { createTestApp, errorOf, handlerOf, mountedRoutes, routeOfFile, sendVia, type Send, type TestRequest } from './app'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, resetDatabase, resetOrder } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The test app (#418): it serves every file under server/api by Nitro's file-name rule, so a test file no longer
// lists the routes it needs, and one reset empties every table the schema declares.
describe('the integration test app', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>

  beforeAll(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(() => {
    stubAuthEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('routeOfFile', () => {
    it.each([
      ['health.get.ts', '/api/health', 'get'],
      ['me.get.ts', '/api/me', 'get'],
      ['e/index.post.ts', '/api/e', 'post'],
      ['e/[slug].get.ts', '/api/e/:slug', 'get'],
      ['e/[slug].delete.ts', '/api/e/:slug', 'delete'],
      ['e/[slug]/countdown/index.put.ts', '/api/e/:slug/countdown', 'put'],
      ['e/[slug]/rounds/index.post.ts', '/api/e/:slug/rounds', 'post'],
      ['e/[slug]/rounds/[id].delete.ts', '/api/e/:slug/rounds/:id', 'delete'],
      ['e/[slug]/rounds/[id]/result.put.ts', '/api/e/:slug/rounds/:id/result', 'put'],
      ['e/[slug]/draws/[drawId]/veto.post.ts', '/api/e/:slug/draws/:drawId/veto', 'post'],
      ['e/[slug]/patch.patch.ts', '/api/e/:slug/patch', 'patch'],
      ['games/tags.get.ts', '/api/games/tags', 'get'],
      ['[...].ts', '/api/**', null],
      ['auth/[...all].ts', '/api/auth/**:all', null],
      ['(admin)/x.get.ts', '/api/x', 'get'],
      ['e/(admin)/y.post.ts', '/api/e/y', 'post'],
      ['plain.mjs', '/api/plain', null],
    ])('maps %s to %s (%s)', (file, route, method) => {
      expect(routeOfFile(file)).toEqual({ route, method })
    })

    it('refuses a file with an environment suffix, which Nitro would mount for one build only', () => {
      expect(() => routeOfFile('x.get.dev.ts')).toThrow('x.get.dev.ts')
      expect(() => routeOfFile('x.get.dev.ts')).toThrow('not supported by the test app')
    })
  })

  describe('the mounted routes', () => {
    /** One line per (route, method, file), the form both sides are compared in. */
    function nitroRoutes() {
      const path = fileURLToPath(new URL('../../.nuxt/types/nitro-routes.d.ts', import.meta.url))
      const hint = 'run `pnpm nuxt prepare` to generate .nuxt/types/nitro-routes.d.ts'
      if (!existsSync(path)) throw new Error(`.nuxt/types/nitro-routes.d.ts is missing: ${hint}`)
      const triples: string[] = []
      let route: string | undefined
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const block = /^\s+'(\/api[^']*)': \{$/.exec(line)
        if (block) route = block[1]
        const entry = /^\s+'(\w+)': .*import\('\.\.\/\.\.\/server\/api\/([^']+)'\)/.exec(line)
        if (entry && route) triples.push(`${route} ${entry[1] === 'default' ? 'null' : entry[1]} ${entry[2]}`)
      }
      if (!triples.length) throw new Error(`.nuxt/types/nitro-routes.d.ts has no /api entry: ${hint}`)
      return triples.sort()
    }

    it('are exactly the files under server/api, as Nitro itself lists them', () => {
      const nitro = nitroRoutes()
      const mounted = mountedRoutes()
        .map(({ route, method, file }) => `${route} ${method} ${file.replace(/\.[A-Za-z]+$/, '')}`)
        .sort()

      const unmounted = nitro.filter(triple => !mounted.includes(triple))
      const unknown = mounted.filter(triple => !nitro.includes(triple))
      expect(unmounted, 'a route Nitro knows that the app does not').toEqual([])
      expect(unknown, 'a file under server/api the test app does not mount').toEqual([])
    })

    it('all load: every file has a default export that is an event handler', async () => {
      await expect(Promise.all(mountedRoutes().map(route => route.load()))).resolves.toHaveLength(mountedRoutes().length)
    })

    it('names the params of each route', () => {
      const byFile = new Map(mountedRoutes().map(route => [route.file, route.params]))

      expect(byFile.get('e/[slug]/draws/[drawId]/veto.post.ts')).toEqual(['slug', 'drawId'])
      expect(byFile.get('auth/[...all].ts')).toEqual(['all'])
      expect(byFile.get('[...].ts')).toEqual([])
      expect(byFile.get('health.get.ts')).toEqual([])
    })
  })

  describe('handlerOf', () => {
    it('fails loudly, with the file, for a module that has no default export', () => {
      expect(() => handlerOf('x.get.ts', {})).toThrow('server/api/x.get.ts has no default export that is an event handler')
    })

    it('fails loudly, with the file, for a default export that is no event handler', () => {
      expect(() => handlerOf('x.get.ts', { default: 42 })).toThrow('server/api/x.get.ts has no default export that is an event handler')
    })

    it('passes an event handler through', () => {
      expect(handlerOf('health.get.ts', { default: health })).toBe(health)
    })
  })

  describe('createTestApp', () => {
    it('serves a route of the tree', async () => {
      const response = await createTestApp(testDb.db)('/api/health')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
    })

    it('answers an unknown API path with the JSON 404 of the catch-all, for a GET and for a POST', async () => {
      const request = createTestApp(testDb.db)

      for (const response of [await request('/api/does-not-exist'), await request('/api/nope/deeper', { method: 'POST' })]) {
        expect(response.status).toBe(404)
        expect(response.headers.get('content-type')).toContain('application/json')
        expect(await response.json()).toMatchObject({ statusMessage: 'Not Found' })
      }
    })

    it('serves a route outside the tree that the caller passes in `extra`', async () => {
      const outside = defineEventHandler(() => ({ outside: true }))

      const response = await createTestApp(testDb.db, {}, { 'GET /api/dev/outside': outside })('/api/dev/outside')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ outside: true })
    })

    it('hands the context the caller passes to the handlers, and nothing else', async () => {
      const echo: EventHandler = defineEventHandler(event => ({ roomNotifier: event.context.roomNotifier ?? null, clock: event.context.clock ?? null }))
      const roomNotifier = { marker: 'notifier' } as never

      const withContext = await createTestApp(testDb.db, { roomNotifier }, { 'GET /api/echo': echo })('/api/echo')
      const without = await createTestApp(testDb.db, {}, { 'GET /api/echo': echo })('/api/echo')

      expect(await withContext.json()).toEqual({ roomNotifier: { marker: 'notifier' }, clock: null })
      expect(await without.json()).toEqual({ roomNotifier: null, clock: null })
    })
  })

  describe('sendVia and errorOf', () => {
    let request: TestRequest
    let send: Send

    beforeAll(() => {
      request = createTestApp(testDb.db, {}, {
        'POST /api/echo': defineEventHandler(async event => ({
          contentType: event.headers.get('content-type'),
          cookie: event.headers.get('cookie'),
          body: await readRawBody(event),
        })),
      })
      send = sendVia(() => request)
    })

    it('sends a request without body or cookie as a bare request', async () => {
      const response = await send('GET', '/api/health', undefined)

      expect(response.status).toBe(200)
    })

    it('sets the JSON content type, the cookie and the stringified body when there is a body', async () => {
      const response = await send('POST', '/api/echo', 'a=b', { n: 1 })

      expect(await response.json()).toEqual({ contentType: 'application/json', cookie: 'a=b', body: '{"n":1}' })
    })

    it('leaves the content type and the cookie out when there is none', async () => {
      const response = await send('POST', '/api/echo', undefined)

      expect(await response.json()).toEqual({ contentType: null, cookie: null })
    })

    it('reads the status and the code of an error response', async () => {
      expect(await errorOf(await send('GET', '/api/nope', undefined))).toEqual({ status: 404, code: 'Not Found' })
    })
  })

  describe('resetDatabase', () => {
    async function tablesOfDatabase() {
      const { rows } = await testDb.client.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
      )
      return rows.map(row => row.table_name).sort()
    }

    it('knows every table of the migrated database and no other', async () => {
      expect([...resetOrder()].sort()).toEqual(await tablesOfDatabase())
    })

    it('empties a table before the tables it references', async () => {
      const { rows } = await testDb.client.query<{ child: string, parent: string }>(`
        select child.relname as child, parent.relname as parent
        from pg_constraint c
        join pg_class child on child.oid = c.conrelid
        join pg_class parent on parent.oid = c.confrelid
        where c.contype = 'f' and child.relnamespace = 'public'::regnamespace and child.oid <> parent.oid`)
      const order = resetOrder()

      expect(rows.length).toBeGreaterThan(0)
      for (const { child, parent } of rows) {
        expect(order.indexOf(child), `${child} before ${parent}`).toBeLessThan(order.indexOf(parent))
      }
    })

    it('empties every table, and the database takes a new Event afterwards', async () => {
      const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
      const guest = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
      const request = createTestApp(testDb.db)
      const send = sendVia(() => request)
      const count = async (table: string) => Number((await testDb.client.query<{ n: number }>(`select count(*)::int as n from "${table}"`)).rows[0]!.n)

      async function populate() {
        setAllowlist({ hosts: 'discord:1' })
        const { cookie: hostCookie } = await signIn(testDb.db, host)
        const { cookie: guestCookie } = await signIn(testDb.db, guest)
        const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS })
        expect(created.status).toBe(200)
        const { slug, inviteUrl } = await created.json() as { slug: string, inviteUrl: string }
        expect((await send('POST', '/api/games', hostCookie, { name: 'Mario Kart', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', clipStart: 0, clipLength: 30 })).status).toBe(200)
        expect((await send('POST', `/api/invite/${new URL(inviteUrl).pathname.slice('/e/'.length)}`, guestCookie)).status).toBe(200)
        const { slots } = await (await send('GET', `/api/e/${slug}`, guestCookie)).json() as { slots: { id: string }[] }
        expect((await send('PUT', `/api/e/${slug}/slots/${slots[0]!.id}/vote`, guestCookie, { value: 'yes' })).status).toBe(200)
      }

      await populate()
      for (const table of ['users', 'events', 'event_members', 'games', 'poll_votes']) {
        expect(await count(table), `${table} is filled before the reset`).toBeGreaterThan(0)
      }

      await resetDatabase(testDb.db)

      for (const table of await tablesOfDatabase()) {
        expect(await count(table), `${table} is empty after the reset`).toBe(0)
      }
      await populate()
      await resetDatabase(testDb.db)
    }, 30_000)
  })
})
