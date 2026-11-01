import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import createGame from '../../server/api/games/index.post'
import joinInvite from '../../server/api/invite/[invite].post'
import { eventMembers, eventPoolGames, events, games, users } from '../../server/db/schema'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { GameView } from '../../shared/game'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Game pool and the Tiebreaker pool of an Event (#146): created with the Event, read back by the Host in full
// by every other Member only while the wheel is not hidden (#148), and otherwise learns nothing about them (#222).

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const

describe('the pools of an Event (#146)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  let hostCookie: string

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/games': createGame,
      'POST /api/invite/:invite': joinInvite,
    })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1', admins: 'discord:9' })
    await testDb.db.delete(eventPoolGames)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(games)
    await testDb.db.delete(users)
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
    it('stores both pools with the Event, and a game may sit in both', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')
      const chess = await newGame('Schach')

      const { slug } = await createdEvent({ pools: { main: [kart.id, pong.id], tiebreaker: [pong.id, chess.id] } })

      const [row] = await testDb.db.select().from(events).where(eq(events.slug, slug))
      const rows = (await poolRows()).map(({ eventId, gameId, pool }) => ({ eventId, gameId, pool }))
      expect(rows).toHaveLength(4)
      expect(rows).toEqual(expect.arrayContaining([
        { eventId: row!.id, gameId: kart.id, pool: 'main' },
        { eventId: row!.id, gameId: pong.id, pool: 'main' },
        { eventId: row!.id, gameId: pong.id, pool: 'tiebreaker' },
        { eventId: row!.id, gameId: chess.id, pool: 'tiebreaker' },
      ]))
    })

    it('allows empty pools, and no pools at all', async () => {
      await createdEvent({ pools: { main: [], tiebreaker: [] } })
      await createdEvent({})

      expect(await poolRows()).toEqual([])
      expect(await testDb.db.select().from(events)).toHaveLength(2)
    })

    it('refuses a game that is not in the library with unknown_game and creates no Event', async () => {
      const kart = await newGame('Mario Kart')

      const response = await create({ pools: { main: [kart.id], tiebreaker: ['00000000-0000-4000-8000-000000000000'] } })

      expect(response.status).toBe(400)
      expect(response.statusText).toBe('unknown_game')
      expect(await testDb.db.select().from(events)).toEqual([])
      expect(await poolRows()).toEqual([])
    })

    it('refuses a malformed pool with invalid_pools and creates no Event', async () => {
      const kart = await newGame('Mario Kart')

      for (const pools of ['main', { main: 'x' }, { main: ['nope'] }, { main: [kart.id, kart.id] }, { tiebreaker: [1] }]) {
        const response = await create({ pools })
        expect(response.status).toBe(400)
        expect(response.statusText).toBe('invalid_pools')
      }
      expect(await testDb.db.select().from(events)).toEqual([])
    })
  })

  describe('GET /api/e/:slug', () => {
    it('gives the Host both pools in full, each sorted by name', async () => {
      const zebra = await newGame('Zebra Rennen')
      const alpha = await newGame('alpha Quest', { playersMin: 2, playersMax: 4, suitabilities: ['teams'] })
      const beta = await newGame('Beta Bowl', { youtubeId: undefined })
      const { slug } = await createdEvent({ pools: { main: [zebra.id, beta.id, alpha.id], tiebreaker: [zebra.id] } })

      const view = await read(hostCookie, slug)

      expect(view.pools).toEqual({
        hidden: false,
        main: [
          { id: alpha.id, name: 'alpha Quest', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: ['teams'], notes: null },
          { id: beta.id, name: 'Beta Bowl', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], notes: null },
          { id: zebra.id, name: 'Zebra Rennen', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], notes: null },
        ],
        tiebreaker: [expect.objectContaining({ id: zebra.id, name: 'Zebra Rennen' })],
      })
    })

    it('gives a Member who may see the pools each game with its notes, and null for a game without notes (#224)', async () => {
      const kart = await newGame('Mario Kart', { notes: 'Settings: 3 Runden\nWarmup: Lobby' })
      const pong = await newGame('Pong')
      const { slug, inviteUrl } = await createdEvent({ pools: { main: [kart.id, pong.id], tiebreaker: [] } })
      const { cookie } = await signIn(testDb.db, member)
      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })).status).toBe(200)

      expect((await read(cookie, slug)).pools).toMatchObject({
        hidden: false,
        main: [
          { name: 'Mario Kart', notes: 'Settings: 3 Runden\nWarmup: Lobby' },
          { name: 'Pong', notes: null },
        ],
      })
    })

    it('gives the Host empty lists for an Event without pools', async () => {
      const { slug } = await createdEvent({})

      expect((await read(hostCookie, slug)).pools).toEqual({ hidden: false, main: [], tiebreaker: [] })
    })

    it('gives every other Member nothing about the pools under a Hidden wheel, no count and not a trace of the games (the full test is hidden-wheel.test.ts, #148, #222)', async () => {
      const secret = await newGame('Geheimes Spiel')
      const other = await newGame('Anderes Spiel')
      const settings = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 }
      const { slug, inviteUrl } = await createdEvent({ settings, pools: { main: [secret.id, other.id], tiebreaker: [secret.id] } })
      const { cookie } = await signIn(testDb.db, member)
      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })).status).toBe(200)

      const response = await request(`/api/e/${slug}`, { headers: { cookie } })
      const raw = await response.text()
      const view = JSON.parse(raw) as EventView

      expect(view.pools).toEqual({ hidden: true })
      expect(raw).not.toContain('Geheimes Spiel')
      expect(raw).not.toContain('Anderes Spiel')
      expect(raw).not.toContain(secret.id)
      expect(raw).not.toContain(other.id)
    })
  })
})
