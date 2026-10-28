import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import listGames from '../../server/api/games/index.get'
import createGame from '../../server/api/games/index.post'
import readGame from '../../server/api/games/[id].get'
import editGame from '../../server/api/games/[id].patch'
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
      'PATCH /api/games/:id': editGame,
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

      expect(await (await list(cookie)).json()).toEqual({ games: [], total: 0 })
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

  describe('player count and Formats (#142)', () => {
    it('stores and answers the player count and the Formats in FORMATS order', async () => {
      const cookie = await cookieOf(host)

      const game = await created(cookie, { name: 'Mario Kart', playersMin: 1, playersMax: 12, formats: ['ffa', 'teams'] })

      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ playersMin: 1, playersMax: 12, formats: ['teams', 'ffa'] })
      expect(game).toMatchObject({ playersMin: 1, playersMax: 12, formats: ['teams', 'ffa'] })
    })

    it('refuses a player count with min above max and stores nothing', async () => {
      const response = await create(await cookieOf(host), { name: 'Mario Kart', playersMin: 8, playersMax: 4 })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_players')
      expect(await testDb.db.select().from(games)).toHaveLength(0)
    })
  })

  describe('PATCH /api/games/:id (#142)', () => {
    const edited = { name: 'Mario Kart 8', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', clipStart: 72, clipLength: 45, playersMin: 2, playersMax: 8, formats: ['teams'] }

    function edit(cookie: string | undefined, id: string, body: unknown) {
      return request(`/api/games/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })
    }

    it('lets the creator edit the game and answers with the new view', async () => {
      const cookie = await cookieOf(host)
      const { id, createdBy } = await created(cookie, { name: 'Mario Kart' })

      const response = await edit(cookie, id, edited)

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ id, name: 'Mario Kart 8', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 45, playersMin: 2, playersMax: 8, formats: ['teams'], canEdit: true })
      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ name: 'Mario Kart 8', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 45, playersMin: 2, playersMax: 8, formats: ['teams'] })
      expect(row!.createdBy).toBe(createdBy.id)
    })

    it('lets the Platform admin edit a game of another Host', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart' })

      const response = await edit(await cookieOf(admin), id, edited)

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ name: 'Mario Kart 8', canEdit: true })
    })

    it('refuses another Host with not_game_editor and changes nothing', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart' })

      const response = await edit(await cookieOf(otherHost), id, edited)

      expect(response.status).toBe(403)
      expect(response.statusText).toBe('not_game_editor')
      const [row] = await testDb.db.select().from(games)
      expect(row!.name).toBe('Mario Kart')
    })

    it('answers a Member as for a missing route and changes nothing', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart' })

      const response = await edit(await cookieOf(member), id, edited)

      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
      const [row] = await testDb.db.select().from(games)
      expect(row!.name).toBe('Mario Kart')
    })

    it('answers signed-out visitors as for a missing route', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart' })

      expect((await edit(undefined, id, edited)).status).toBe(404)
    })

    it('answers an unknown id as for a missing route', async () => {
      const response = await edit(await cookieOf(host), '00000000-0000-4000-8000-000000000000', edited)

      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
    })

    it('keeps the image and the creator when the game is edited', async () => {
      const { id, createdBy } = await created(await cookieOf(host), { name: 'Mario Kart' })
      await testDb.db.update(games).set({ imageKey: 'games/abc.webp' }).where(eq(games.id, id))

      await edit(await cookieOf(admin), id, edited)

      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ imageKey: 'games/abc.webp', createdBy: createdBy.id })
    })

    it('refuses an invalid body with its code and changes nothing', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart' })

      const response = await edit(cookie, id, { ...edited, name: '' })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_game_name')
      const [row] = await testDb.db.select().from(games)
      expect(row!.name).toBe('Mario Kart')
    })

    it('clears the player count and the Formats when they are sent empty', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', playersMin: 2, playersMax: 8, formats: ['teams'] })

      await edit(cookie, id, { ...edited, playersMin: null, playersMax: null, formats: [] })

      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ playersMin: null, playersMax: null, formats: [] })
    })
  })

  describe('filters on GET /api/games (#142)', () => {
    // Five games: names, counts and Formats chosen so every filter has something to keep and something to drop.
    async function seed() {
      const hostCookie = await cookieOf(host)
      await created(hostCookie, { name: 'Mario Kart', playersMin: 1, playersMax: 12, formats: ['teams', 'ffa'] })
      await created(hostCookie, { name: 'Counter-Strike 2', playersMin: 2, playersMax: 10, formats: ['teams'] })
      await created(hostCookie, { name: 'Halo', playersMax: 4, formats: ['ffa'] })
      await created(hostCookie, { name: 'Offen', playersMin: 6 })
      await created(await cookieOf(otherHost), { name: 'Brettspiel' })
    }

    it('keeps the games whose name contains the search, ignoring case and surrounding spaces', async () => {
      await seed()
      const cookie = await cookieOf(host)

      expect(await (await request('/api/games?q=mario', { headers: { cookie } })).json()).toMatchObject({ games: [{ name: 'Mario Kart' }] })
      expect(await (await request('/api/games?q=%20KART%20', { headers: { cookie } })).json()).toMatchObject({ games: [{ name: 'Mario Kart' }] })
      expect(await (await request('/api/games?q=%20%20', { headers: { cookie } })).json()).toMatchObject({ games: expect.any(Array) })
      expect(((await (await request('/api/games?q=%20%20', { headers: { cookie } })).json()) as GameList).games).toHaveLength(5)
    })

    it('reads % and _ in the search as plain characters', async () => {
      const cookie = await cookieOf(host)
      await created(cookie, { name: 'Rocket 100%' })
      await created(cookie, { name: 'Rocket 1000' })
      await created(cookie, { name: 'Die_Siedler' })
      await created(cookie, { name: 'Die Siedler' })

      const percent = await (await request('/api/games?q=%25', { headers: { cookie } })).json() as GameList
      const underscore = await (await request('/api/games?q=_', { headers: { cookie } })).json() as GameList

      expect(percent.games.map(game => game.name)).toEqual(['Rocket 100%'])
      expect(underscore.games.map(game => game.name)).toEqual(['Die_Siedler'])
    })

    it('keeps the games whose recommended range covers the player count, open bounds included', async () => {
      await seed()
      const cookie = await cookieOf(host)
      const at = async (players: number) => (await (await request(`/api/games?players=${players}`, { headers: { cookie } })).json() as GameList).games.map(game => game.name).sort()

      expect(await at(3)).toEqual(['Counter-Strike 2', 'Halo', 'Mario Kart'])
      expect(await at(5)).toEqual(['Counter-Strike 2', 'Mario Kart'])
      expect(await at(11)).toEqual(['Mario Kart', 'Offen'])
      expect(await at(50)).toEqual(['Offen'])
    })

    it('leaves out a game without any player count when the player count is filtered', async () => {
      await seed()
      const cookie = await cookieOf(host)

      const { games: found } = await (await request('/api/games?players=3', { headers: { cookie } })).json() as GameList

      expect(found.map(game => game.name)).not.toContain('Brettspiel')
    })

    it('ignores a player count that is no whole number from 1 to 99', async () => {
      await seed()
      const cookie = await cookieOf(host)

      for (const players of ['abc', '0', '100', '2.5']) {
        const { games: found } = await (await request(`/api/games?players=${players}`, { headers: { cookie } })).json() as GameList
        expect(found).toHaveLength(5)
      }
    })

    it('keeps the games that suit the Format, and ignores an unknown one', async () => {
      await seed()
      const cookie = await cookieOf(host)
      const by = async (query: string) => (await (await request(`/api/games?${query}`, { headers: { cookie } })).json() as GameList).games.map(game => game.name).sort()

      expect(await by('format=teams')).toEqual(['Counter-Strike 2', 'Mario Kart'])
      expect(await by('format=ffa')).toEqual(['Halo', 'Mario Kart'])
      expect(await by('format=wild')).toHaveLength(5)
    })

    it('keeps the games the viewer created with mine=1', async () => {
      await seed()
      const cookie = await cookieOf(host)

      const { games: found } = await (await request('/api/games?mine=1', { headers: { cookie } })).json() as GameList

      expect(found.map(game => game.name).sort()).toEqual(['Counter-Strike 2', 'Halo', 'Mario Kart', 'Offen'])
      expect((await (await request('/api/games?mine=0', { headers: { cookie } })).json() as GameList).games).toHaveLength(5)
    })

    it('combines the filters with AND', async () => {
      await seed()
      const cookie = await cookieOf(host)

      const { games: found } = await (await request('/api/games?players=3&format=teams&mine=1&q=counter', { headers: { cookie } })).json() as GameList
      const { games: none } = await (await request('/api/games?players=3&format=ffa&q=counter', { headers: { cookie } })).json() as GameList

      expect(found.map(game => game.name)).toEqual(['Counter-Strike 2'])
      expect(none).toEqual([])
    })

    it('keeps total at the full count of the library under filters', async () => {
      await seed()
      const cookie = await cookieOf(host)

      const body = await (await request('/api/games?q=halo&mine=1', { headers: { cookie } })).json() as GameList

      expect(body.games.map(game => game.name)).toEqual(['Halo'])
      expect(body.total).toBe(5)
    })
  })
})
