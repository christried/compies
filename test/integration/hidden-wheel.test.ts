import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import listGames from '../../server/api/games/index.get'
import createGame from '../../server/api/games/index.post'
import readGame from '../../server/api/games/[id].get'
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

// THE secrecy test of release 1.3 (#148): under a Hidden wheel nobody but the Host learns which games are in the
// pools, not through the Event read, not through the image route, not through the library.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const player = { provider: 'discord', id: '2', name: 'Gast', email: 'player@example.com', image: undefined } as const
const stranger = { provider: 'discord', id: '4', name: 'Fremder', email: 'stranger@example.com', image: undefined } as const

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
function webp(payload: string): Uint8Array {
  const bytes = new Uint8Array(40)
  bytes.set([...ascii('RIFF'), 32, 0, 0, 0, ...ascii('WEBPVP8 '), ...ascii(payload)])
  return bytes
}

const HIDDEN_WHEEL = { ...TEST_SETTINGS, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 } as const

describe('Hidden wheel secrecy (#148)', () => {
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
      'POST /api/invite/:invite': joinInvite,
      'GET /api/games': listGames,
      'POST /api/games': createGame,
      'GET /api/games/:id': readGame,
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

  interface Secret { id: string, name: string, videoId: string, imageUrl: string, imageKey: string }

  async function newGame(name: string, videoId: string): Promise<Secret> {
    const created = await request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({ name, youtubeUrl: `https://youtu.be/${videoId}` }),
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
    expect(view.youtubeId).toBe(videoId)
    return { id, name, videoId, imageUrl: view.imageUrl!, imageKey: view.imageUrl!.slice('/api/images/'.length) }
  }

  /** A, B in the Game pool, C in the Tiebreaker pool; the Player has joined. */
  async function setUp(settings: Record<string, unknown> = HIDDEN_WHEEL) {
    const a = await newGame('Alpha Arena', 'aaaaaaaaaaa')
    const b = await newGame('Beta Bowling', 'bbbbbbbbbbb')
    const c = await newGame('Gamma Garten', 'ccccccccccc')
    const response = await request('/api/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': hostCookie },
      body: JSON.stringify({
        name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'], settings,
        pools: { main: [a.id, b.id], tiebreaker: [c.id] },
      }),
    })
    expect(response.status).toBe(200)
    const { slug, inviteUrl } = await response.json() as CreatedEvent
    const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
    expect((await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: playerCookie } })).status).toBe(200)
    return { slug, secrets: [a, b, c], a }
  }

  async function rawRead(cookie: string, slug: string) {
    const response = await request(`/api/e/${slug}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return await response.text()
  }

  const traces = (secret: Secret) => [secret.name, secret.id, secret.imageKey, secret.videoId]

  function setWheelHidden(hidden: boolean) {
    return testDb.db.update(events).set({ hiddenWheel: hidden })
  }

  it('gives a Player under a Hidden wheel only the counts: not a name, id, image key or video id anywhere in the raw response', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(playerCookie, slug)

    expect((JSON.parse(raw) as EventView).pools).toEqual({ hidden: true, mainCount: 2, tiebreakerCount: 1 })
    for (const trace of secrets.flatMap(traces)) expect(raw).not.toContain(trace)
    expect(raw).not.toMatch(/api\/images/)
  })

  it('gives the Host the games under a Hidden wheel', async () => {
    const { slug, secrets } = await setUp()

    const raw = await rawRead(hostCookie, slug)

    for (const trace of secrets.flatMap(traces)) expect(raw).toContain(trace)
    expect((JSON.parse(raw) as EventView).pools.hidden).toBe(false)
  })

  it('gives the Player the games once the wheel is not hidden, and the counts again when it is hidden again', async () => {
    const { slug, secrets } = await setUp()

    await setWheelHidden(false)
    const open = await rawRead(playerCookie, slug)
    expect((JSON.parse(open) as EventView).pools).toMatchObject({ hidden: false, main: [{ name: 'Alpha Arena' }, { name: 'Beta Bowling' }], tiebreaker: [{ name: 'Gamma Garten' }] })
    for (const secret of secrets) {
      for (const trace of [secret.name, secret.id, secret.imageKey, secret.videoId]) expect(open).toContain(trace)
    }

    await setWheelHidden(true)
    const closed = await rawRead(playerCookie, slug)
    for (const trace of secrets.flatMap(traces)) expect(closed).not.toContain(trace)
    expect((JSON.parse(closed) as EventView).pools).toEqual({ hidden: true, mainCount: 2, tiebreakerCount: 1 })
  })

  it('gives the Player the games of an Event with a visible Lucky wheel from the start', async () => {
    const { slug } = await setUp({ ...HIDDEN_WHEEL, hiddenWheel: false })

    expect((JSON.parse(await rawRead(playerCookie, slug)) as EventView).pools.hidden).toBe(false)
  })

  describe('the image route', () => {
    async function fetchImage(secret: Secret, cookie?: string) {
      return await request(secret.imageUrl, { headers: cookie ? { cookie } : {} })
    }

    it('refuses the Player the image of an undrawn game under a Hidden wheel, in either pool', async () => {
      const { secrets } = await setUp()

      for (const secret of secrets) {
        const response = await fetchImage(secret, playerCookie)
        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
      }
    })

    it('serves the Player the image once the wheel is not hidden, and refuses it again when hidden again', async () => {
      const { secrets, a } = await setUp()

      await setWheelHidden(false)
      for (const secret of secrets) {
        const response = await fetchImage(secret, playerCookie)
        expect(response.status).toBe(200)
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp(secret.name))
      }

      await setWheelHidden(true)
      expect((await fetchImage(a, playerCookie)).status).toBe(404)
    })

    it('serves the Host the images under a Hidden wheel, also after the Host lost the library permission', async () => {
      const { a } = await setUp()
      expect((await fetchImage(a, hostCookie)).status).toBe(200)

      await testDb.db.update(users).set({ canHost: false }).where(eq(users.name, 'Hostess'))

      expect((await fetchImage(a, hostCookie)).status).toBe(200)
    })

    it('refuses a signed-in User who is no Member of the Event, whatever the wheel says', async () => {
      const { a } = await setUp()
      const strangerCookie = (await signIn(testDb.db, stranger)).cookie

      expect((await fetchImage(a, strangerCookie)).status).toBe(404)
      await setWheelHidden(false)
      expect((await fetchImage(a, strangerCookie)).status).toBe(404)
      expect((await fetchImage(a)).status).toBe(404)
    })

    it('refuses a Member of a deleted Event', async () => {
      const { a } = await setUp()
      await setWheelHidden(false)
      expect((await fetchImage(a, playerCookie)).status).toBe(200)

      await testDb.db.update(events).set({ deletedAt: new Date() })

      expect((await fetchImage(a, playerCookie)).status).toBe(404)
    })

    it('serves a game that sits in a second Event with a visible wheel', async () => {
      const { a } = await setUp()
      const second = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({
          name: 'Samstags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-11-30T20:30'], settings: { ...HIDDEN_WHEEL, hiddenWheel: false },
          pools: { main: [a.id], tiebreaker: [] },
        }),
      })
      const { inviteUrl } = await second.json() as CreatedEvent
      expect((await fetchImage(a, playerCookie)).status).toBe(404)

      const invite = new URL(inviteUrl).pathname.slice('/e/'.length)
      await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: playerCookie } })

      expect((await fetchImage(a, playerCookie)).status).toBe(200)
    })
  })

  it('still answers 404 to the Player on the library routes', async () => {
    const { secrets, a } = await setUp()
    await setWheelHidden(false)

    expect((await request('/api/games', { headers: { cookie: playerCookie } })).status).toBe(404)
    for (const secret of secrets) {
      expect((await request(`/api/games/${secret.id}`, { headers: { cookie: playerCookie } })).status).toBe(404)
    }
    expect((await request(`/api/games/${a.id}`, { headers: { cookie: hostCookie } })).status).toBe(200)
  })
})
