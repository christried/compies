import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import listGames from '../../server/api/games/index.get'
import createGame from '../../server/api/games/index.post'
import readGame from '../../server/api/games/[id].get'
import { games, users } from '../../server/db/schema'
import type { GameList, GameView } from '../../shared/game'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Admin', email: 'admin@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '3', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const

describe('the Game library API (#141)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/games': listGames,
      'POST /api/games': createGame,
      'GET /api/games/:id': readGame,
    })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
    await testDb.db.delete(games)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function cookieOf(profile: Parameters<typeof signIn>[1]) {
    return (await signIn(testDb.db, profile)).cookie
  }

  function list(cookie?: string) {
    return request('/api/games', { headers: cookie ? { cookie } : {} })
  }

  function read(id: string, cookie?: string) {
    return request(`/api/games/${id}`, { headers: cookie ? { cookie } : {} })
  }

  function create(cookie: string | undefined, body: unknown) {
    return request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  async function created(cookie: string, body: unknown) {
    const response = await create(cookie, body)
    expect(response.status).toBe(200)
    return await response.json() as GameView
  }

  describe('who may use it', () => {
    it('answers as for a missing route when signed out', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart' })

      for (const response of [await list(), await read(id), await create(undefined, { name: 'Neu' })]) {
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
      }
      expect(await testDb.db.select().from(games)).toHaveLength(1)
    })

    it('answers as for a missing route to a Member without the Host permission, and stores nothing', async () => {
      const hostCookie = await cookieOf(host)
      const { id } = await created(hostCookie, { name: 'Mario Kart' })
      const cookie = await cookieOf(member)

      expect((await list(cookie)).status).toBe(404)
      expect((await read(id, cookie)).status).toBe(404)
      expect((await create(cookie, { name: 'Neu' })).status).toBe(404)
      expect(await testDb.db.select().from(games)).toHaveLength(1)
    })

    it('lets the Host in', async () => {
      const cookie = await cookieOf(host)

      expect((await list(cookie)).status).toBe(200)
      expect((await create(cookie, { name: 'Mario Kart' })).status).toBe(200)
    })

    it('lets the Platform admin in', async () => {
      const cookie = await cookieOf(admin)

      expect((await list(cookie)).status).toBe(200)
      expect((await create(cookie, { name: 'Mario Kart' })).status).toBe(200)
    })
  })

  describe('POST /api/games', () => {
    it('stores a game with the video id of a youtu.be link, created by the Host', async () => {
      const cookie = await cookieOf(host)

      const game = await created(cookie, { name: '  Mario Kart ', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5', clipStart: 72, clipLength: 45 })

      const [row] = await testDb.db.select().from(games)
      const [hostRow] = await testDb.db.select().from(users).where(eq(users.id, row!.createdBy))
      expect(hostRow!.name).toBe('Hostess')
      expect(row).toMatchObject({ name: 'Mario Kart', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 45, imageKey: null })
      expect(game).toEqual({
        id: row!.id, name: 'Mario Kart', imageUrl: null, youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 45,
        playersMin: null, playersMax: null, formats: [],
        createdBy: { id: row!.createdBy, name: 'Hostess' }, createdAt: row!.createdAt.toISOString(), canEdit: true,
      })
    })

    it('shows the creator under the display name when they set one', async () => {
      const cookie = await cookieOf(host)
      await testDb.db.update(users).set({ displayName: 'Kitty' }).where(eq(users.name, 'Hostess'))

      const game = await created(cookie, { name: 'Mario Kart' })

      expect(game.createdBy.name).toBe('Kitty')
    })

    it('stores a game without a link as a game without a clip', async () => {
      const cookie = await cookieOf(host)

      await created(cookie, { name: 'Brettspiel', youtubeUrl: '' })

      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ youtubeId: null, clipStart: 0, clipLength: 30 })
    })

    it('refuses a broken link with invalid_youtube and stores nothing', async () => {
      const cookie = await cookieOf(host)

      const response = await create(cookie, { name: 'Mario Kart', youtubeUrl: 'https://vimeo.com/123' })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_youtube')
      expect(await testDb.db.select().from(games)).toHaveLength(0)
    })

    it.each([
      [{ name: '' }, 'invalid_game_name'],
      [{ name: 'Mario Kart', clipLength: 4 }, 'invalid_clip'],
    ])('refuses %j with %s', async (body, code) => {
      const cookie = await cookieOf(host)

      const response = await create(cookie, body)

      expect(response.status).toBe(400)
      expect(response.statusText).toBe(code)
      expect(await testDb.db.select().from(games)).toHaveLength(0)
    })

    it('lists the new game', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart' })

      const { games: listed } = await (await list(cookie)).json() as GameList

      expect(listed.map(entry => entry.id)).toEqual([game.id])
    })
  })

  describe('GET /api/games', () => {
    it('is empty without games', async () => {
      const cookie = await cookieOf(host)

      expect(await (await list(cookie)).json()).toEqual({ games: [] })
    })

    it('orders by name, ignoring case', async () => {
      const cookie = await cookieOf(host)
      for (const name of ['zelda', 'Banjo', 'Mario Kart', 'apex', 'Zombies']) await created(cookie, { name })

      const { games: listed } = await (await list(cookie)).json() as GameList

      expect(listed.map(game => game.name)).toEqual(['apex', 'Banjo', 'Mario Kart', 'zelda', 'Zombies'])
    })

    it('shows every Host the games of all Hosts', async () => {
      await created(await cookieOf(host), { name: 'Von Hostess' })
      const cookie = await cookieOf(otherHost)

      const { games: listed } = await (await list(cookie)).json() as GameList

      expect(listed.map(game => game.name)).toEqual(['Von Hostess'])
    })
  })

  describe('GET /api/games/:id', () => {
    it('returns one game', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart', youtubeUrl: 'youtu.be/dQw4w9WgXcQ' })

      const response = await read(game.id, cookie)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(game)
    })

    it.each([
      ['an unknown id', '00000000-0000-4000-8000-000000000000'],
      ['an id that is no uuid', 'not-a-uuid'],
    ])('answers as for a missing route for %s', async (_name, id) => {
      const cookie = await cookieOf(host)

      const response = await read(id, cookie)

      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
    })

    it('lets the creator and the Platform admin edit, another Host not', async () => {
      const game = await created(await cookieOf(host), { name: 'Mario Kart' })

      const asCreator = await (await read(game.id, await cookieOf(host))).json() as GameView
      const asAdmin = await (await read(game.id, await cookieOf(admin))).json() as GameView
      const asOther = await (await read(game.id, await cookieOf(otherHost))).json() as GameView

      expect([asCreator.canEdit, asAdmin.canEdit, asOther.canEdit]).toEqual([true, true, false])
    })
  })
})
