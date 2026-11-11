import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventPoolGames, events } from '../../server/db/schema'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { GameView } from '../../shared/game'
import { createTestApp, type TestRequest } from './app'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, resetDatabase } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Game pool of an Event (#146, ADR 0014, #286): the list under `pool`, created with the Event, read back by the Host in full,
// by every other Member as picture and name only while the Pool preview is on (#148, #224, #225), and otherwise they learn
// nothing about it (#222).

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const

describe('the pool of an Event (#146, #286)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let hostCookie: string

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db)
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1', admins: 'discord:9' })
    await resetDatabase(testDb.db)
    hostCookie = (await signIn(testDb.db, host)).cookie
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function newGame(name: string, extra: Record<string, unknown> = {}) {
    const response = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name, ...extra }),
    })
    expect(response.status).toBe(200)
    return await response.json() as GameView
  }

  function create(body: Record<string, unknown>) {
    return request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings: TEST_SETTINGS, ...body }),
    })
  }

  async function createdEvent(body: Record<string, unknown>) {
    const response = await create(body)
    expect(response.status).toBe(200)
    return await response.json() as CreatedEvent
  }

  async function read(cookie: string, slug: string) {
    const response = await request(`/api/e/${slug}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return await response.json() as EventView
  }

  async function poolRows() {
    return testDb.db.select().from(eventPoolGames)
  }

  describe('POST /api/e', () => {
    it('stores the Game pool with the Event', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')

      const { slug } = await createdEvent({ pool: [kart.id, pong.id] })

      const [row] = await testDb.db.select().from(events).where(eq(events.slug, slug))
      const rows = (await poolRows()).map(({ eventId, gameId }) => ({ eventId, gameId }))
      expect(rows).toHaveLength(2)
      expect(rows).toEqual(expect.arrayContaining([
        { eventId: row!.id, gameId: kart.id },
        { eventId: row!.id, gameId: pong.id },
      ]))
    })

    it('allows an empty Game pool, and no pool at all', async () => {
      await createdEvent({ pool: [] })
      await createdEvent({})

      expect(await poolRows()).toEqual([])
      expect(await testDb.db.select().from(events)).toHaveLength(2)
    })

    it('refuses a game that is not in the library with unknown_game and creates no Event', async () => {
      const kart = await newGame('Mario Kart')

      const response = await create({ pool: [kart.id, '00000000-0000-4000-8000-000000000000'] })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('unknown_game')
      expect(await testDb.db.select().from(events)).toEqual([])
      expect(await poolRows()).toEqual([])
    })

    it('refuses a malformed Game pool with invalid_pools and creates no Event', async () => {
      const kart = await newGame('Mario Kart')

      for (const pool of ['main', { main: [kart.id] }, ['nope'], [kart.id, kart.id], [42]]) {
        const response = await create({ pool })
        expect(response.status).toBe(400)
        expect(response.statusText).toBe('invalid_pools')
      }
      expect(await testDb.db.select().from(events)).toEqual([])
    })

    it('refuses the old shape, a `pools` key of any value, with invalid_pools and creates no Event (#286)', async () => {
      const kart = await newGame('Mario Kart')

      for (const pools of [{ main: [kart.id] }, { main: [] }, [kart.id], 'main', null]) {
        const response = await create({ pools })
        expect(response.status).toBe(400)
        expect(response.statusText).toBe('invalid_pools')
      }
      const both = await create({ pool: [kart.id], pools: { main: [kart.id] } })
      expect(both.status).toBe(400)
      expect(both.statusText).toBe('invalid_pools')
      expect(await testDb.db.select().from(events)).toEqual([])
      expect(await poolRows()).toEqual([])
    })
  })

  describe('GET /api/e/:slug', () => {
    it('gives the Host the Game pool in full, as a list sorted by name', async () => {
      const zebra = await newGame('Zebra Rennen')
      const alpha = await newGame('alpha Quest', { playersMin: 2, playersMax: 4, suitabilities: ['teams'] })
      const beta = await newGame('Beta Bowl', { youtubeId: undefined })
      const { slug } = await createdEvent({ pool: [zebra.id, beta.id, alpha.id] })

      const view = await read(hostCookie, slug)

      expect(view.pool).toEqual([
        { id: alpha.id, name: 'alpha Quest', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: null, price: null },
        { id: beta.id, name: 'Beta Bowl', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], notes: null, price: null },
        { id: zebra.id, name: 'Zebra Rennen', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], notes: null, price: null },
      ])
    })

    it('gives the Host and a joined Member the Price of each pool game as the library has it, and a Member only the face keys (#338, #444)', async () => {
      const kart = await newGame('Mario Kart', { price: { cents: 1999, source: 'steam' } })
      const tetris = await newGame('Tetris', { price: { cents: null, source: 'free_to_play' } })
      const { slug, inviteUrl } = await createdEvent({ pool: [kart.id, tetris.id] })
      const { cookie } = await signIn(testDb.db, member)
      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })).status).toBe(200)

      const hostPool = (await read(hostCookie, slug)).pool!
      const memberPool = (await read(cookie, slug)).pool!

      expect(kart.price).toMatchObject({ cents: 1999, source: 'steam' })
      expect(tetris.price).toMatchObject({ cents: null, source: 'free_to_play' })
      for (const game of [kart, tetris]) {
        expect(hostPool.find(item => item.id === game.id)).toMatchObject({ price: game.price })
        expect(memberPool.find(item => item.id === game.id)).toMatchObject({ price: game.price })
      }
      for (const face of memberPool) expect(Object.keys(face).sort()).toEqual(['id', 'imageUrl', 'name', 'playersMax', 'playersMin', 'price', 'suitabilities', 'youtubeId'])
    })

    it('gives a Member who may see the pool only the picture, name, players, Suitabilities and Price of each game, even when it has notes (#224, #444)', async () => {
      const kart = await newGame('Mario Kart', { notes: 'Settings: 3 Runden\nWarmup: Lobby', playersMin: 2, playersMax: 4, suitabilities: ['teams'] })
      const pong = await newGame('Pong')
      const { slug, inviteUrl } = await createdEvent({ pool: [kart.id, pong.id] })
      const { cookie } = await signIn(testDb.db, member)
      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })).status).toBe(200)

      const pool = (await read(cookie, slug)).pool!

      expect(pool).toEqual([
        { id: kart.id, name: 'Mario Kart', imageUrl: null, youtubeId: null, price: null, playersMin: 2, playersMax: 4, suitabilities: ['teams'] },
        { id: pong.id, name: 'Pong', imageUrl: null, youtubeId: null, price: null, playersMin: null, playersMax: null, suitabilities: [] },
      ])
    })

    it('gives the Host every field of a pool game, the notes too (#224)', async () => {
      const kart = await newGame('Mario Kart', { notes: 'Settings: 3 Runden', playersMin: 2, playersMax: 4 })
      const { slug } = await createdEvent({ pool: [kart.id] })

      expect((await read(hostCookie, slug)).pool!).toEqual([
        { id: kart.id, name: 'Mario Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], notes: 'Settings: 3 Runden', price: null },
      ])
    })

    it('gives the Host an empty Game pool for an Event without a pool', async () => {
      const { slug } = await createdEvent({})

      expect((await read(hostCookie, slug)).pool).toEqual([])
    })

    it('gives every other Member nothing about the pools under a Hidden wheel, no count and not a trace of the games (the full test is hidden-wheel.test.ts, #148, #222)', async () => {
      const secret = await newGame('Geheimes Spiel')
      const other = await newGame('Anderes Spiel')
      const settings = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 }
      const { slug, inviteUrl } = await createdEvent({ settings, pool: [secret.id, other.id] })
      const { cookie } = await signIn(testDb.db, member)
      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })).status).toBe(200)

      const response = await request(`/api/e/${slug}`, { headers: { cookie } })
      const raw = await response.text()
      const view = JSON.parse(raw) as EventView

      expect(view.pool).toBeNull()
      expect(raw).not.toContain('Geheimes Spiel')
      expect(raw).not.toContain('Anderes Spiel')
      expect(raw).not.toContain(secret.id)
      expect(raw).not.toContain(other.id)
    })
  })
})
