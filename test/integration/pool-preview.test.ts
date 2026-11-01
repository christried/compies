import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import readEvent from '../../server/api/e/[slug].get'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import createEvent from '../../server/api/e/index.post'
import createGame from '../../server/api/games/index.post'
import putImage from '../../server/api/games/[id]/image.put'
import getImage from '../../server/api/images/[key].get'
import joinInvite from '../../server/api/invite/[invite].post'
import { eventMembers, eventPoolGames, events, games, users } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { GameView } from '../../shared/game'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The secrecy of the Pool preview (#225), the same promise as the Hidden wheel's (hidden-wheel.test.ts): with the
// Pool preview off a Player learns nothing about the pools, not through the Event read, not through the image route,
// not as a count. Under Host pick and under a visible wheel alike. The Host always sees both pools.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const player = { provider: 'discord', id: '2', name: 'Gast', email: 'player@example.com', image: undefined } as const

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
function webp(payload: string): Uint8Array {
  const bytes = new Uint8Array(40)
  bytes.set([...ascii('RIFF'), 32, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii(payload)])
  return bytes
}

const HOST_PICK = { ...TEST_SETTINGS, poolPreview: false } as const
const VISIBLE_WHEEL = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: false, vetoAllowance: 3, poolPreview: false } as const

describe('Pool preview secrecy (#225)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const store = memoryImageStore()
  let hostCookie: string
  let playerCookie: string

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/invite/:invite': joinInvite,
      'POST /api/games': createGame,
      'PUT /api/games/:id/image': putImage,
      'GET /api/images/:key': getImage,
    }, { imageStore: store })
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
    store.clear()
    hostCookie = (await signIn(testDb.db, host)).cookie
    playerCookie = (await signIn(testDb.db, player)).cookie
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  interface PoolGame { id: string, name: string, videoId: string, imageUrl: string, imageKey: string, notes: string }

  async function newGame(name: string, videoId: string): Promise<PoolGame> {
    const created = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name, youtubeUrl: `https://youtu.be/${videoId}`, notes: `Hausregel zu ${name}` }),
    })
    expect(created.status).toBe(200)
    const { id } = await created.json() as GameView
    const uploaded = await request(`/api/games/${id}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'cookie': hostCookie },
      body: webp(name) as BodyInit,
    })
    expect(uploaded.status).toBe(200)
    const view = await uploaded.json() as GameView
    return { id, name, videoId, imageUrl: view.imageUrl!, imageKey: view.imageUrl!.slice('/api/images/'.length), notes: view.notes! }
  }

  /** A, B in the Game pool, C in the Tiebreaker pool; the Player has joined. */
  async function setUp(settings: Record<string, unknown>) {
    const pool = [await newGame('Alpha Arena', 'aaaaaaaaaaa'), await newGame('Beta Bowling', 'bbbbbbbbbbb'), await newGame('Gamma Garten', 'ccccccccccc')]
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({
        name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings,
        pools: { main: [pool[0]!.id, pool[1]!.id], tiebreaker: [pool[2]!.id] },
      }),
    })
    expect(response.status).toBe(200)
    const { slug, inviteUrl } = await response.json() as CreatedEvent
    const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
    expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: playerCookie } })).status).toBe(200)
    return { slug, pool }
  }

  async function rawRead(cookie: string, slug: string) {
    const response = await request(`/api/e/${slug}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return await response.text()
  }

  // Everything a pool game shows: the Event read of a viewer who may see the pools holds all of it, that of one who may not holds none of it (notes too, #223, #224).
  const traces = (game: PoolGame) => [game.name, game.id, game.imageKey, game.videoId, game.notes]

  function fetchImage(game: PoolGame, cookie: string) {
    return request(game.imageUrl, { headers: { cookie } })
  }

  function patch(slug: string, settings: Record<string, unknown>) {
    return request(`/api/e/${slug}/settings`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'cookie': hostCookie }, body: JSON.stringify({ settings }) })
  }

  describe.each([
    ['Host pick', HOST_PICK],
    ['a visible Lucky Wheel', VISIBLE_WHEEL],
  ])('under %s with the Pool preview off', (_mode, settings) => {
    it('gives a Player nothing about the pools: not a count, name, id, image key or video id anywhere in the raw response', async () => {
      const { slug, pool } = await setUp(settings)

      const raw = await rawRead(playerCookie, slug)

      expect((JSON.parse(raw) as EventView).pools).toBeNull()
      for (const trace of pool.flatMap(traces)) expect(raw).not.toContain(trace)
      expect(raw).not.toMatch(/api\/images/)
    })

    it('gives a Player the same response however many games the pools hold', async () => {
      const { slug } = await setUp(settings)
      const before = await rawRead(playerCookie, slug)

      const delta = await newGame('Delta Dart', 'ddddddddddd')
      const [eventRow] = await testDb.db.select({ id: events.id }).from(events)
      await testDb.db.insert(eventPoolGames).values([
        { eventId: eventRow!.id, gameId: delta.id, pool: 'main' },
        { eventId: eventRow!.id, gameId: delta.id, pool: 'tiebreaker' },
      ])

      // The control: the Host sees the new game, so the insert really changed the pools.
      expect(await rawRead(hostCookie, slug)).toContain('Delta Dart')
      expect(await rawRead(playerCookie, slug)).toBe(before)
    })

    it('refuses the Player the image of a pool game, in either pool, as a missing route', async () => {
      const { pool } = await setUp(settings)

      for (const game of pool) {
        const response = await fetchImage(game, playerCookie)
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
      }
    })

    it('gives the Host both pools in full, and the images', async () => {
      const { slug, pool } = await setUp(settings)

      const raw = await rawRead(hostCookie, slug)

      for (const trace of pool.flatMap(traces)) expect(raw).toContain(trace)
      expect((JSON.parse(raw) as EventView).pools).toMatchObject({ main: [{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }], tiebreaker: [{ name: 'Gamma Garten' }] })
      for (const game of pool) {
        const response = await fetchImage(game, hostCookie)
        expect(response.status).toBe(200)
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp(game.name))
      }
    })

    it('shows the Player the games and serves the images from the moment the Host turns the Pool preview on, and hides them again when it is turned off', async () => {
      const { slug, pool } = await setUp(settings)

      expect((await patch(slug, { poolPreview: true })).status).toBe(200)
      const open = await rawRead(playerCookie, slug)
      expect((JSON.parse(open) as EventView).pools).toMatchObject({ main: [{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }], tiebreaker: [{ name: 'Gamma Garten' }] })
      for (const trace of pool.flatMap(traces)) expect(open).toContain(trace)
      for (const game of pool) expect((await fetchImage(game, playerCookie)).status).toBe(200)

      expect((await patch(slug, { poolPreview: false })).status).toBe(200)
      const closed = await rawRead(playerCookie, slug)
      for (const trace of pool.flatMap(traces)) expect(closed).not.toContain(trace)
      expect((JSON.parse(closed) as EventView).pools).toBeNull()
      for (const game of pool) expect((await fetchImage(game, playerCookie)).status).toBe(404)
    })
  })

  it('gives a Player the games of a Host pick Event created with the Pool preview on (the default)', async () => {
    const { slug, pool } = await setUp(TEST_SETTINGS)

    const raw = await rawRead(playerCookie, slug)

    expect((JSON.parse(raw) as EventView).pools).toMatchObject({ main: [{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }], tiebreaker: [{ name: 'Gamma Garten' }] })
    for (const trace of pool.flatMap(traces)) expect(raw).toContain(trace)
    for (const game of pool) expect((await fetchImage(game, playerCookie)).status).toBe(200)
  })
})
