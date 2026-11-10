import { asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameTags, games, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { GameList, GameView } from '../../shared/game'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const admin = { provider: 'discord', id: '9', name: 'Admin', email: 'admin@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '3', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const

describe('the Game library API (#141)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  // The server's clock (#337): the Price's day is stamped with it. Moved by the Prices tests, back to its start before each.
  const clock = testClock('2026-11-03T10:00:00.000Z')

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
    await resetDatabase(testDb.db)
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
        playersMin: null, playersMax: null, suitabilities: [], tags: [], price: null,
        createdBy: { id: row!.createdBy, name: 'Hostess' }, createdAt: row!.createdAt.toISOString(), canEdit: true, notes: null,
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

      expect(await (await list(cookie)).json()).toEqual({ games: [], tagsInUse: [] })
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

  describe('player count and Suitabilities (#142, #171)', () => {
    it('stores and answers the player count and the Suitabilities in SUITABILITIES order', async () => {
      const cookie = await cookieOf(host)

      const game = await created(cookie, { name: 'Mario Kart', playersMin: 1, playersMax: 12, suitabilities: ['ffa', 'teams'] })

      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ playersMin: 1, playersMax: 12, suitabilities: ['teams', 'ffa'] })
      expect(game).toMatchObject({ playersMin: 1, playersMax: 12, suitabilities: ['teams', 'ffa'] })
    })

    it.each([
      [['teams']],
      [['ffa']],
      [['one_v_one']],
      [['teams', 'one_v_one']],
      [['ffa', 'one_v_one']],
      [['teams', 'ffa', 'one_v_one']],
    ])('stores and answers the Suitabilities %j, one_v_one included', async (suitabilities) => {
      const cookie = await cookieOf(host)

      const game = await created(cookie, { name: 'Mario Kart', suitabilities })

      const [row] = await testDb.db.select().from(games)
      expect(row!.suitabilities).toEqual(suitabilities)
      expect(game.suitabilities).toEqual(suitabilities)
    })

    it('stores a game that is 1 gegen 1 when it is edited, and answers the new Suitabilities', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', suitabilities: ['teams'] })

      const response = await request(`/api/games/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Mario Kart', suitabilities: ['one_v_one', 'teams'] }),
      })

      expect(await response.json()).toMatchObject({ id, suitabilities: ['teams', 'one_v_one'] })
      const [row] = await testDb.db.select().from(games)
      expect(row!.suitabilities).toEqual(['teams', 'one_v_one'])
    })

    it('refuses a Suitability that is not one of the three, with invalid_suitabilities', async () => {
      const response = await create(await cookieOf(host), { name: 'Mario Kart', suitabilities: ['one-v-one'] })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_suitabilities')
      expect(await testDb.db.select().from(games)).toHaveLength(0)
    })

    it('refuses a player count with min above max and stores nothing', async () => {
      const response = await create(await cookieOf(host), { name: 'Mario Kart', playersMin: 8, playersMax: 4 })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_players')
      expect(await testDb.db.select().from(games)).toHaveLength(0)
    })
  })

  describe('Game notes (#223)', () => {
    // Three people and two joiners make one emoji, one character (#76).
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'

    function edit(cookie: string | undefined, id: string, body: unknown) {
      return request(`/api/games/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })
    }

    it('stores the notes with their inner line breaks and answers them', async () => {
      const notes = 'Settings: 3 Runden\nWarmup: Lobby\n\nWin: meiste Punkte'

      const game = await created(await cookieOf(host), { name: 'Mario Kart', notes })

      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBe(notes)
      expect(game.notes).toBe(notes)
    })

    it('trims leading and trailing blank space from the notes and keeps the inner line breaks', async () => {
      const game = await created(await cookieOf(host), { name: 'Mario Kart', notes: '  \n Settings\n\nWin  \n\n' })

      expect(game.notes).toBe('Settings\n\nWin')
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBe('Settings\n\nWin')
    })

    it.each([
      ['only blank space', '  \n\t '],
      ['an empty text', ''],
      ['null', null],
    ])('stores %s as no notes', async (_, notes) => {
      const game = await created(await cookieOf(host), { name: 'Mario Kart', notes })

      expect(game.notes).toBeNull()
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBeNull()
    })

    it('stores a game sent without notes as no notes', async () => {
      const game = await created(await cookieOf(host), { name: 'Mario Kart' })

      expect(game.notes).toBeNull()
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBeNull()
    })

    it('accepts exactly 1000 characters', async () => {
      const notes = 'a'.repeat(1000)

      const response = await create(await cookieOf(host), { name: 'Mario Kart', notes })

      expect(response.status).toBe(200)
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBe(notes)
    })

    it('counts an emoji as one character: 999 letters and one family emoji are accepted', async () => {
      const notes = `${'a'.repeat(999)}${family}`

      const response = await create(await cookieOf(host), { name: 'Mario Kart', notes })

      expect(response.status).toBe(200)
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBe(notes)
    })

    it('refuses 1001 characters with invalid_game_notes and stores nothing', async () => {
      const response = await create(await cookieOf(host), { name: 'Mario Kart', notes: 'a'.repeat(1001) })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_game_notes')
      expect(await testDb.db.select().from(games)).toHaveLength(0)
    })

    it('lets the creator change the notes, and a PATCH without notes clears them', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', notes: 'Alt' })

      const changed = await edit(cookie, id, { name: 'Mario Kart', notes: 'Neu\nZeile zwei' })
      expect(await changed.json()).toMatchObject({ notes: 'Neu\nZeile zwei' })

      await edit(cookie, id, { name: 'Mario Kart' })
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBeNull()
    })

    it('lets the Platform admin change the notes of another Host\'s game', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart', notes: 'Alt' })

      const response = await edit(await cookieOf(admin), id, { name: 'Mario Kart', notes: 'Vom Admin' })

      expect(response.status).toBe(200)
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBe('Vom Admin')
    })

    it('refuses another Host with not_game_editor and keeps the notes', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart', notes: 'Alt' })

      const response = await edit(await cookieOf(otherHost), id, { name: 'Mario Kart', notes: 'Fremd' })

      expect(response.status).toBe(403)
      expect(response.statusText).toBe('not_game_editor')
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBe('Alt')
    })

    it('refuses a too-long edit with invalid_game_notes and keeps the notes', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', notes: 'Alt' })

      const response = await edit(cookie, id, { name: 'Mario Kart', notes: 'a'.repeat(1001) })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_game_notes')
      const [row] = await testDb.db.select().from(games)
      expect(row!.notes).toBe('Alt')
    })

    it('returns the notes to every Host, on the game and in the list', async () => {
      const notes = 'Settings: 3 Runden\nWin: Punkte'
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart', notes })
      const otherCookie = await cookieOf(otherHost)

      expect(await (await read(id, otherCookie)).json()).toMatchObject({ id, notes })
      const list = await (await request('/api/games', { headers: { cookie: otherCookie } })).json() as GameList
      expect(list.games.find(game => game.id === id)).toMatchObject({ notes })
    })
  })

  describe('PATCH /api/games/:id (#142)', () => {
    const edited = { name: 'Mario Kart 8', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', clipStart: 72, clipLength: 45, playersMin: 2, playersMax: 8, suitabilities: ['teams'] }

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
      expect(await response.json()).toMatchObject({ id, name: 'Mario Kart 8', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 45, playersMin: 2, playersMax: 8, suitabilities: ['teams'], canEdit: true })
      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ name: 'Mario Kart 8', youtubeId: 'dQw4w9WgXcQ', clipStart: 72, clipLength: 45, playersMin: 2, playersMax: 8, suitabilities: ['teams'] })
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

    it('clears the player count and the Suitabilities when they are sent empty', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', playersMin: 2, playersMax: 8, suitabilities: ['teams'] })

      await edit(cookie, id, { ...edited, playersMin: null, playersMax: null, suitabilities: [] })

      const [row] = await testDb.db.select().from(games)
      expect(row).toMatchObject({ playersMin: null, playersMax: null, suitabilities: [] })
    })
  })

  describe('GET /api/games without filters (#173)', () => {
    // The browser filters (filterGames); the server answers every visible game, whatever the query string says.
    async function seed() {
      const hostCookie = await cookieOf(host)
      await created(hostCookie, { name: 'Mario Kart', playersMin: 1, playersMax: 12, suitabilities: ['teams', 'ffa'] })
      await created(hostCookie, { name: 'Counter-Strike 2', playersMin: 2, playersMax: 10, suitabilities: ['teams'] })
      await created(hostCookie, { name: 'Halo', playersMax: 4, suitabilities: ['ffa'] })
      await created(await cookieOf(otherHost), { name: 'Brettspiel' })
    }

    it('returns every game, by name without regard to case, and no total', async () => {
      await seed()
      const cookie = await cookieOf(host)

      const body = await (await request('/api/games', { headers: { cookie } })).json() as GameList

      expect(body.games.map(game => game.name)).toEqual(['Brettspiel', 'Counter-Strike 2', 'Halo', 'Mario Kart'])
      expect(body).not.toHaveProperty('total')
    })

    it('ignores a query string', async () => {
      await seed()
      const cookie = await cookieOf(host)

      const plain = await (await request('/api/games', { headers: { cookie } })).json() as GameList
      const queried = await (await request('/api/games?q=x&suitability=teams&players=3&mine=1', { headers: { cookie } })).json() as GameList

      expect(queried).toEqual(plain)
      expect(queried.games).toHaveLength(4)
    })
  })

  describe('Tags (#335)', () => {
    const flag = '\u{1F1E9}\u{1F1EA}'

    function edit(cookie: string | undefined, id: string, body: unknown) {
      return request(`/api/games/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })
    }

    async function tagRows(gameId?: string) {
      const rows = await testDb.db.select().from(gameTags).orderBy(asc(gameTags.gameId), asc(gameTags.position))
      return rows.filter(row => !gameId || row.gameId === gameId).map(({ key, label, position }) => ({ key, label, position }))
    }

    async function tagsInUse(cookie: string) {
      return ((await (await list(cookie)).json()) as GameList).tagsInUse
    }

    it('stores the Tags trimmed and collapsed, in the order sent, and answers them on the game, the list and the detail', async () => {
      const cookie = await cookieOf(host)

      const game = await created(cookie, { name: 'Mario Kart', tags: ['  Co-op ', 'Battle   Royale'] })

      const expected = [{ key: 'co-op', label: 'Co-op' }, { key: 'battle royale', label: 'Battle Royale' }]
      expect(game.tags).toEqual(expected)
      expect(((await (await list(cookie)).json()) as GameList).games[0]!.tags).toEqual(expected)
      expect(((await (await read(game.id, cookie)).json()) as GameView).tags).toEqual(expected)
      expect(await tagRows()).toEqual([
        { key: 'co-op', label: 'Co-op', position: 0 },
        { key: 'battle royale', label: 'Battle Royale', position: 1 },
      ])
    })

    it('gives a game without tags an empty list, and the library no Tags in use', async () => {
      const cookie = await cookieOf(host)

      const game = await created(cookie, { name: 'Mario Kart' })

      expect(game.tags).toEqual([])
      expect(await tagsInUse(cookie)).toEqual([])
      expect(await tagRows()).toEqual([])
    })

    it('stores exactly 8 Tags and a Tag of 20 flags', async () => {
      const cookie = await cookieOf(host)
      const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

      const game = await created(cookie, { name: 'Mario Kart', tags: eight })
      const flags = await created(cookie, { name: 'Flaggen', tags: [flag.repeat(20)] })

      expect(game.tags.map(tag => tag.label)).toEqual(eight)
      expect(flags.tags).toEqual([{ key: flag.repeat(20), label: flag.repeat(20) }])
    })

    it.each([
      ['nine Tags', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']],
      ['a Tag of 21 characters', ['x'.repeat(21)]],
      ['a Tag of 21 flags', [flag.repeat(21)]],
      ['one key twice', ['Co-op', 'co-op']],
      ['a Tag of spaces', ['  ']],
      ['text instead of a list', 'Co-op'],
    ])('refuses %s with invalid_tags and stores nothing', async (_name, tags) => {
      const cookie = await cookieOf(host)

      const response = await create(cookie, { name: 'Mario Kart', tags })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_tags')
      expect(await testDb.db.select().from(games)).toHaveLength(0)
      expect(await tagRows()).toEqual([])
    })

    it('keeps the game and its Tags when an edit is refused', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', tags: ['Co-op'] })

      const response = await edit(cookie, id, { name: 'Neu', tags: ['a', 'A'] })

      expect(response.statusText).toBe('invalid_tags')
      expect(await tagRows(id)).toEqual([{ key: 'co-op', label: 'Co-op', position: 0 }])
      expect((await testDb.db.select().from(games))[0]!.name).toBe('Mario Kart')
    })

    it('reorders, adds and drops Tags on an edit and answers the new order', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', tags: ['Co-op', 'Party'] })

      const response = await edit(cookie, id, { name: 'Mario Kart', tags: ['Retro', 'Co-op'] })

      expect(((await response.json()) as GameView).tags.map(tag => tag.label)).toEqual(['Retro', 'Co-op'])
      expect(await tagRows(id)).toEqual([
        { key: 'retro', label: 'Retro', position: 0 },
        { key: 'co-op', label: 'Co-op', position: 1 },
      ])
    })

    it('clears every Tag with an empty list', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', tags: ['Co-op', 'Party'] })

      const response = await edit(cookie, id, { name: 'Mario Kart', tags: [] })

      expect(((await response.json()) as GameView).tags).toEqual([])
      expect(await tagRows()).toEqual([])
    })

    it('keeps the Tags when an edit sends none, as a browser tab of 0.9 does', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', tags: ['Co-op', 'Party'] })

      const response = await edit(cookie, id, { name: 'Mario Kart 8' })

      expect(((await response.json()) as GameView).tags.map(tag => tag.label)).toEqual(['Co-op', 'Party'])
      expect(await tagRows(id)).toHaveLength(2)
    })

    it('keeps the spelling a Tag already has on the game when it is typed in another case', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', tags: ['Co-op'] })

      const response = await edit(cookie, id, { name: 'Mario Kart', tags: ['CO-OP', 'Party'] })

      expect(((await response.json()) as GameView).tags.map(tag => tag.label)).toEqual(['Co-op', 'Party'])
    })

    it('shows a Tag under the spelling first used in the library, on a second game too', async () => {
      const cookie = await cookieOf(host)
      await created(cookie, { name: 'Mario Kart', tags: ['Co-op'] })

      const second = await created(cookie, { name: 'Halo', tags: ['CO-OP'] })

      expect(second.tags).toEqual([{ key: 'co-op', label: 'Co-op' }])
      expect(await tagRows(second.id)).toEqual([{ key: 'co-op', label: 'Co-op', position: 0 }])
      expect(await tagsInUse(cookie)).toEqual([{ key: 'co-op', label: 'Co-op' }])
    })

    it('lists the Tags in use once per key, by key with the umlaut where German sorts it', async () => {
      const cookie = await cookieOf(host)
      await created(cookie, { name: 'Eins', tags: ['Retro', 'Co-op'] })
      await created(cookie, { name: 'Zwei', tags: ['Ärger', 'retro'] })

      expect(await tagsInUse(cookie)).toEqual([
        { key: 'ärger', label: 'Ärger' },
        { key: 'co-op', label: 'Co-op' },
        { key: 'retro', label: 'Retro' },
      ])
    })

    it('drops a Tag from the Tags in use when its last game loses it, and keeps one another game carries', async () => {
      const cookie = await cookieOf(host)
      const first = await created(cookie, { name: 'Eins', tags: ['Co-op', 'Retro'] })
      await created(cookie, { name: 'Zwei', tags: ['Retro'] })

      await edit(cookie, first.id, { name: 'Eins', tags: [] })

      expect((await tagsInUse(cookie)).map(tag => tag.key)).toEqual(['retro'])
    })

    it('refuses another Host\'s edit of the Tags, and answers a Member as for a missing route', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart', tags: ['Co-op'] })

      const other = await edit(await cookieOf(otherHost), id, { name: 'Mario Kart', tags: [] })
      const guest = await edit(await cookieOf(member), id, { name: 'Mario Kart', tags: [] })

      expect(other.status).toBe(403)
      expect(other.statusText).toBe('not_game_editor')
      expect(guest.status).toBe(404)
      expect(await tagRows(id)).toEqual([{ key: 'co-op', label: 'Co-op', position: 0 }])
    })
  })

  describe('Prices (#337)', () => {
    const T1 = '2026-11-03T10:00:00.000Z'
    const T2 = '2026-11-05T09:00:00.000Z'
    const T3 = '2026-11-07T09:00:00.000Z'
    const steam = { cents: 1999, source: 'steam' }

    beforeEach(() => {
      clock.set(T1)
    })

    function edit(cookie: string | undefined, id: string, body: unknown) {
      return request(`/api/games/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })
    }

    /** The three Price columns of the stored row, the day as its ISO string (or null). */
    async function storedPrice(id: string) {
      const [row] = await testDb.db.select().from(games).where(eq(games.id, id))
      return { cents: row!.priceCents, source: row!.priceSource, checkedAt: row!.priceCheckedAt?.toISOString() ?? null }
    }

    /** The game's Tags as stored, in position order: what a Price edit must leave as it was. */
    async function tagRowsOf(gameId: string) {
      const rows = await testDb.db.select().from(gameTags).where(eq(gameTags.gameId, gameId)).orderBy(asc(gameTags.position))
      return rows.map(({ key, label, position }) => ({ key, label, position }))
    }

    it('stores a Price with the day of the server clock and answers it on the game, the detail and the list', async () => {
      const cookie = await cookieOf(host)

      const game = await created(cookie, { name: 'Mario Kart', price: steam })

      const expected = { cents: 1999, source: 'steam', checkedAt: T1 }
      expect(game.price).toEqual(expected)
      expect(await storedPrice(game.id)).toEqual(expected)
      expect(((await (await read(game.id, cookie)).json()) as GameView).price).toEqual(expected)
      expect(((await (await list(cookie)).json()) as GameList).games[0]!.price).toEqual(expected)
    })

    it('stores no Price for a game sent without one, or with price null', async () => {
      const cookie = await cookieOf(host)

      const without = await created(cookie, { name: 'Ohne' })
      const withNull = await created(cookie, { name: 'Null', price: null })

      expect(without.price).toBeNull()
      expect(withNull.price).toBeNull()
      expect(await storedPrice(without.id)).toEqual({ cents: null, source: null, checkedAt: null })
      expect(await storedPrice(withNull.id)).toEqual({ cents: null, source: null, checkedAt: null })
    })

    it('stores a free game and a subscription with no amount, stamped with the day', async () => {
      const cookie = await cookieOf(host)

      const free = await created(cookie, { name: 'Frei', price: { cents: null, source: 'free_to_play' } })
      const abo = await created(cookie, { name: 'Abo', price: { cents: null, source: 'subscription' } })

      expect(free.price).toEqual({ cents: null, source: 'free_to_play', checkedAt: T1 })
      expect(await storedPrice(abo.id)).toEqual({ cents: null, source: 'subscription', checkedAt: T1 })
    })

    it.each([
      [{ price: { cents: 1999, source: null } }],
      [{ price: { cents: 1999 } }],
      [{ price: { cents: 500, source: 'free_to_play' } }],
      [{ price: { cents: 500, source: 'subscription' } }],
      [{ price: { cents: null, source: 'steam' } }],
      [{ price: { cents: 0, source: 'steam' } }],
      [{ price: { cents: 100_000, source: 'steam' } }],
      [{ price: { cents: 19.5, source: 'steam' } }],
      [{ price: { cents: '1999', source: 'steam' } }],
      [{ price: { cents: 1999, source: 'amazon' } }],
      [{ price: 'steam' }],
      [{ priceChecked: 'yes' }],
      [{ priceChecked: true }],
    ])('refuses %j with invalid_price and stores no game', async (extra) => {
      const response = await create(await cookieOf(host), { name: 'Mario Kart', ...extra })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_price')
      expect(await testDb.db.select().from(games)).toEqual([])
    })

    it('moves the day when the amount changes, and when the source changes', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      clock.set(T2)
      const amount = await edit(cookie, id, { name: 'Mario Kart', price: { cents: 2499, source: 'steam' } })
      expect((await amount.json() as GameView).price).toEqual({ cents: 2499, source: 'steam', checkedAt: T2 })

      clock.set(T3)
      const source = await edit(cookie, id, { name: 'Mario Kart', price: { cents: 2499, source: 'epic' } })
      expect((await source.json() as GameView).price).toEqual({ cents: 2499, source: 'epic', checkedAt: T3 })
      expect(await storedPrice(id)).toEqual({ cents: 2499, source: 'epic', checkedAt: T3 })
    })

    it('keeps the day when a save changes the name and not the Price', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      clock.set(T2)
      const response = await edit(cookie, id, { name: 'Mario Kart 8', price: steam })

      expect(await response.json()).toMatchObject({ name: 'Mario Kart 8', price: { cents: 1999, source: 'steam', checkedAt: T1 } })
    })

    it('keeps the Price and its day when an edit has no price, as a browser tab of 0.9 sends it', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      clock.set(T2)
      const response = await edit(cookie, id, { name: 'Mario Kart 8' })

      expect(await response.json()).toMatchObject({ name: 'Mario Kart 8', price: { cents: 1999, source: 'steam', checkedAt: T1 } })
      expect(await storedPrice(id)).toEqual({ cents: 1999, source: 'steam', checkedAt: T1 })
    })

    it('„Preis stimmt noch“ moves only the day, and keeps the rest of the game as the form sent it', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, {
        name: 'Mario Kart',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        clipStart: 72,
        clipLength: 45,
        playersMin: 2,
        playersMax: 8,
        suitabilities: ['teams'],
        notes: 'Die Fernbedienung nicht vergessen',
        tags: ['Co-op'],
        price: steam,
      })
      const before = await testDb.db.select().from(games).where(eq(games.id, id))
      const tagsBefore = await tagRowsOf(id)

      clock.set(T2)
      const response = await edit(cookie, id, {
        name: 'Mario Kart',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        clipStart: 72,
        clipLength: 45,
        playersMin: 2,
        playersMax: 8,
        suitabilities: ['teams'],
        notes: 'Die Fernbedienung nicht vergessen',
        priceChecked: true,
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ price: { cents: 1999, source: 'steam', checkedAt: T2 }, tags: [{ key: 'co-op', label: 'Co-op' }] })
      const [after] = await testDb.db.select().from(games).where(eq(games.id, id))
      expect(after).toMatchObject({
        name: before[0]!.name,
        youtubeId: before[0]!.youtubeId,
        clipStart: before[0]!.clipStart,
        clipLength: before[0]!.clipLength,
        playersMin: before[0]!.playersMin,
        playersMax: before[0]!.playersMax,
        suitabilities: before[0]!.suitabilities,
        notes: before[0]!.notes,
        priceCents: 1999,
        priceSource: 'steam',
        priceCheckedAt: new Date(T2),
      })
      expect(await tagRowsOf(id)).toEqual(tagsBefore)
    })

    it('„Preis stimmt noch“ sent with the Price itself also moves the day only', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      clock.set(T2)
      const response = await edit(cookie, id, { name: 'Mario Kart', price: steam, priceChecked: true })

      expect(await response.json()).toMatchObject({ price: { cents: 1999, source: 'steam', checkedAt: T2 } })
    })

    it.each([
      [{ priceChecked: true }],
      [{ priceChecked: true, price: null }],
    ])('refuses %j on a game without a Price, with invalid_price, and changes nothing', async (extra) => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart' })

      clock.set(T2)
      const response = await edit(cookie, id, { name: 'Mario Kart 8', ...extra })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('invalid_price')
      expect(await storedPrice(id)).toEqual({ cents: null, source: null, checkedAt: null })
      expect((await (await read(id, cookie)).json() as GameView).name).toBe('Mario Kart')
    })

    it('clears the Price with price null, and clears it again without an error', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      clock.set(T2)
      const first = await edit(cookie, id, { name: 'Mario Kart', price: null })
      const second = await edit(cookie, id, { name: 'Mario Kart', price: null })

      expect(first.status).toBe(200)
      expect(await first.json()).toMatchObject({ price: null })
      expect(second.status).toBe(200)
      expect(await storedPrice(id)).toEqual({ cents: null, source: null, checkedAt: null })
    })

    it('moves the day and clears the amount when a paid game becomes free', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      clock.set(T2)
      const response = await edit(cookie, id, { name: 'Mario Kart', price: { cents: null, source: 'free_to_play' } })

      expect(await response.json()).toMatchObject({ price: { cents: null, source: 'free_to_play', checkedAt: T2 } })
    })

    it('refuses an edit with an invalid Price, changes nothing, and saves the Tags and the Price of a valid one together', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      const refused = await edit(cookie, id, { name: 'Mario Kart 8', price: { cents: 500, source: 'free_to_play' } })
      expect(refused.status).toBe(400)
      expect(refused.statusText).toBe('invalid_price')
      expect((await (await read(id, cookie)).json() as GameView).name).toBe('Mario Kart')

      clock.set(T2)
      const saved = await edit(cookie, id, { name: 'Mario Kart 8', tags: ['Co-op'], price: { cents: 2499, source: 'gog' } })
      expect(await saved.json()).toMatchObject({ name: 'Mario Kart 8', tags: [{ key: 'co-op', label: 'Co-op' }], price: { cents: 2499, source: 'gog', checkedAt: T2 } })
    })

    it('lets the Platform admin change the Price of another Host\'s game, and refuses another Host with not_game_editor and keeps it', async () => {
      const { id } = await created(await cookieOf(host), { name: 'Mario Kart', price: steam })

      const other = await edit(await cookieOf(otherHost), id, { name: 'Mario Kart', price: null })
      expect(other.status).toBe(403)
      expect(other.statusText).toBe('not_game_editor')
      expect(await storedPrice(id)).toEqual({ cents: 1999, source: 'steam', checkedAt: T1 })

      const guest = await edit(await cookieOf(member), id, { name: 'Mario Kart', price: null })
      expect(guest.status).toBe(404)
      expect(await storedPrice(id)).toEqual({ cents: 1999, source: 'steam', checkedAt: T1 })

      const superAdmin = await edit(await cookieOf(admin), id, { name: 'Mario Kart', price: { cents: 2499, source: 'steam' } })
      expect(superAdmin.status).toBe(200)
      expect(await storedPrice(id)).toEqual({ cents: 2499, source: 'steam', checkedAt: T1 })
    })
  })
})
