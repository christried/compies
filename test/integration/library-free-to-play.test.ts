import { asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameTags } from '../../server/db/schema'
import type { GameView } from '../../shared/game'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Tag „Free-to-play“ follows the Price on every save (#423): a game without a Price, or with the source Free-to-play,
// carries it; any other Price takes it off, also when typed. The server decides; the form only sends the Tags as typed.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const

const FREE = { tag: { key: 'free-to-play', label: 'Free-to-play' } }
const steam = { cents: 1999, source: 'steam' }
const freeToPlay = { cents: null, source: 'free_to_play' }

describe('the Tag „Free-to-play“ follows the Price (#423)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db)
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

  function edit(cookie: string | undefined, id: string, body: unknown) {
    return request(`/api/games/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  /** The game's Tags as stored, in position order: what the database holds, not what an answer says. */
  async function tagRowsOf(gameId: string) {
    const rows = await testDb.db.select().from(gameTags).where(eq(gameTags.gameId, gameId)).orderBy(asc(gameTags.position))
    return rows.map(({ key, label, position }) => ({ key, label, position }))
  }

  describe('on create (POST /api/games)', () => {
    it('gives a game without a Price the Tag, after the Tags sent', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart', tags: ['Co-op'] })

      expect(game.tags).toEqual([{ key: 'co-op', label: 'Co-op' }, FREE.tag])
      expect(await tagRowsOf(game.id)).toEqual([
        { key: 'co-op', label: 'Co-op', position: 0 },
        { key: 'free-to-play', label: 'Free-to-play', position: 1 },
      ])
    })

    it('gives a game with the source Free-to-play the Tag', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Tetris', price: freeToPlay })

      expect(game.tags).toEqual([FREE.tag])
      expect(game.price).toMatchObject({ cents: null, source: 'free_to_play' })
    })

    it('gives a game with a Steam Price no Tag, and drops a Free-to-play Tag typed by hand', async () => {
      const cookie = await cookieOf(host)
      const game = await created(cookie, { name: 'Mario Kart', price: steam, tags: ['Co-op', 'Free-to-play'] })

      expect(game.tags).toEqual([{ key: 'co-op', label: 'Co-op' }])
      expect(game.price).toMatchObject({ cents: 1999, source: 'steam' })
      expect(await tagRowsOf(game.id)).toEqual([{ key: 'co-op', label: 'Co-op', position: 0 }])
    })

    it('keeps the label of the key already in use, whatever spelling the form sent', async () => {
      const cookie = await cookieOf(host)
      await created(cookie, { name: 'Eins' })
      const game = await created(cookie, { name: 'Zwei', tags: ['free-to-play'] })

      expect(game.tags).toEqual([FREE.tag])
      expect(await tagRowsOf(game.id)).toEqual([{ key: 'free-to-play', label: 'Free-to-play', position: 0 }])
    })

    it('saves a no-Price game with eight other Tags with those eight, and no error', async () => {
      const cookie = await cookieOf(host)
      const others = ['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht']
      const response = await create(cookie, { name: 'Voll', tags: others })

      expect(response.status).toBe(200)
      const game = await response.json() as GameView
      expect(game.tags.map(tag => tag.label)).toEqual(others)
      expect(await tagRowsOf(game.id)).toHaveLength(8)
    })
  })

  describe('on edit (PATCH /api/games/:id)', () => {
    it('removes the Tag when the edit sets an amount, also when the Tag was typed by hand', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Tetris' })

      const response = await edit(cookie, id, { name: 'Tetris', price: steam, tags: [FREE.tag.label] })

      expect(response.status).toBe(200)
      const game = await response.json() as GameView
      expect(game.price).toMatchObject({ cents: 1999, source: 'steam' })
      expect(game.tags).toEqual([])
      expect(await tagRowsOf(id)).toEqual([])
    })

    it('adds the Tag, last, when the edit clears the Price', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam, tags: ['Co-op'] })

      const game = await (await edit(cookie, id, { name: 'Mario Kart', price: null, tags: ['Co-op'] })).json() as GameView

      expect(game.price).toBeNull()
      expect(game.tags).toEqual([{ key: 'co-op', label: 'Co-op' }, FREE.tag])
      expect(await tagRowsOf(id)).toEqual([
        { key: 'co-op', label: 'Co-op', position: 0 },
        { key: 'free-to-play', label: 'Free-to-play', position: 1 },
      ])
    })

    it('adds the Tag when the edit switches the Price to the source Free-to-play', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      const game = await (await edit(cookie, id, { name: 'Mario Kart', price: freeToPlay, tags: [] })).json() as GameView

      expect(game.price).toMatchObject({ cents: null, source: 'free_to_play' })
      expect(game.tags).toEqual([FREE.tag])
    })

    it('keeps the Price and its day as sent, and writes the Tag only through the rule', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam })

      const game = await (await edit(cookie, id, { name: 'Mario Kart', price: steam, tags: ['Co-op'] })).json() as GameView

      expect(game.price).toMatchObject({ cents: 1999, source: 'steam' })
      expect(game.tags).toEqual([{ key: 'co-op', label: 'Co-op' }])
    })

    it('leaves the Tags of a restamp as they are: a Steam game without the Tag, a free game with it', async () => {
      const cookie = await cookieOf(host)
      const steamGame = await created(cookie, { name: 'Mario Kart', price: steam, tags: ['Co-op'] })
      const freeGame = await created(cookie, { name: 'Tetris', price: freeToPlay })

      const restampedSteam = await (await edit(cookie, steamGame.id, { priceChecked: true })).json() as GameView
      const restampedFree = await (await edit(cookie, freeGame.id, { priceChecked: true })).json() as GameView

      expect(restampedSteam.tags).toEqual([{ key: 'co-op', label: 'Co-op' }])
      expect(restampedFree.tags).toEqual([FREE.tag])
      expect(await tagRowsOf(freeGame.id)).toEqual([{ key: 'free-to-play', label: 'Free-to-play', position: 0 }])
    })

    it('applies the rule to the stored Tags of an edit without tags, and the answer carries what is stored', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Mario Kart', price: steam, tags: ['Co-op'] })
      // A row the rule would not keep: a Free-to-play Tag on a game with a Steam Price (written outside the route).
      await testDb.db.insert(gameTags).values({ gameId: id, key: 'free-to-play', label: 'Free-to-play', position: 1 })

      const game = await (await edit(cookie, id, { name: 'Mario Kart', price: steam })).json() as GameView

      expect(game.tags).toEqual([{ key: 'co-op', label: 'Co-op' }])
      expect(await tagRowsOf(id)).toEqual([{ key: 'co-op', label: 'Co-op', position: 0 }])
    })

    it('does not add the Tag to a game with eight other Tags, and the save succeeds', async () => {
      const cookie = await cookieOf(host)
      const others = ['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht']
      const { id } = await created(cookie, { name: 'Voll', price: steam, tags: others })

      const response = await edit(cookie, id, { name: 'Voll', price: null, tags: others })

      expect(response.status).toBe(200)
      expect(((await response.json()) as GameView).tags.map(tag => tag.label)).toEqual(others)
      expect(await tagRowsOf(id)).toHaveLength(8)
    })

    it('is refused for a Member, as before, and changes nothing', async () => {
      const cookie = await cookieOf(host)
      const { id } = await created(cookie, { name: 'Tetris' })

      const response = await edit(await cookieOf(member), id, { name: 'Tetris', price: steam, tags: [] })

      expect(response.status).toBe(404)
      expect(await tagRowsOf(id)).toEqual([{ key: 'free-to-play', label: 'Free-to-play', position: 0 }])
    })
  })
})
