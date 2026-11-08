import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import finishEvent from '../../server/api/e/[slug]/finish.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import putResult from '../../server/api/e/[slug]/rounds/[id]/result.put'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import shareImage from '../../server/api/e/[slug]/share-image.get'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import { activity, eventMembers, eventPoolGames, events, games, pollSlots, roundPlaces, rounds, sessions, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { fileShareAssets } from '../../server/utils/share-assets'
import type { EventView } from '../../shared/event'
import type { Phase } from '../../shared/phase'
import type { ShareImageModel } from '../../shared/share-image'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// What the renderer was asked to draw, so a test can read the model the route built (it is the model that says what the picture holds).
const drawn = vi.hoisted(() => ({ models: [] as ShareImageModel[] }))
vi.mock('../../server/utils/share-render', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/utils/share-render')>()
  return {
    ...real,
    renderShareImage: (model: ShareImageModel, assets: Parameters<typeof real.renderShareImage>[1]) => {
      drawn.models.push(model)
      return real.renderShareImage(model, assets)
    },
  }
})

// The Share image route (#313, spec #308): `GET /api/e/:slug/share-image?format=wide|square` through the HTTP API with a real render
// (fonts, SVGs and WebAssembly from the source tree) and the in-memory room. Who gets it, what it refuses and how, what it stores
// (nothing), and what its model holds. The rules of the model are unit-tested in share-image.test.ts; the pixels are looked at by eye.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
  // Not on a team: one Member on the Stands (a Spectator), one on the Bench.
  spectator: { provider: 'twitch', id: '6', name: 'Zuschauer', email: 'spectator@example.com', image: undefined },
  bench: { provider: 'twitch', id: '7', name: 'Bank', email: 'bench@example.com', image: undefined },
} as const
const outsider = { provider: 'twitch', id: '8', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

const SLOTS = ['2090-10-30T20:30']
const T0 = '2090-10-30T10:00:00.000Z'
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

describe('the Share image route', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'GET /api/e/:slug/activity': getActivity,
      'GET /api/e/:slug/share-image': shareImage,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/move': moveMember,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/rounds': setGame,
      'PUT /api/e/:slug/rounds/:id/result': putResult,
      'POST /api/e/:slug/finish': finishEvent,
    }, { roomNotifier: notifier, clock, shareAssets: fileShareAssets() })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    drawn.models = []
    await testDb.db.delete(roundPlaces)
    await testDb.db.delete(rounds)
    await testDb.db.delete(sessions)
    await testDb.db.delete(eventPoolGames)
    await testDb.db.delete(activity)
    await testDb.db.delete(pollSlots)
    await testDb.db.delete(eventMembers)
    await testDb.db.delete(events)
    await testDb.db.delete(games)
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  /**
   * An Event with one Session, two Parties of two Players, a Spectator and a Bench Member, and a pool of two games of which only Halo is
   * played (Kart stays in the pool). `finish: false` leaves it running with its result in; the Host's cookie, the Members' and an outsider's come back.
   */
  async function event({ finish = true, tie = false }: { finish?: boolean, tie?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = {} as Record<keyof typeof players | 'outsider', string>
    for (const [key, profile] of Object.entries(players)) cookies[key as keyof typeof players] = (await signIn(testDb.db, profile)).cookie
    cookies.outsider = (await signIn(testDb.db, outsider)).cookie
    const settings = { ...TEST_SETTINGS, teamCount: 2, teamSize: 2, gameCount: 1, pointsTable: { preset: 'linear' as const, values: [1, 0] } }
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: SLOTS, settings })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const eventId = eventRow!.id
    const ids = {} as Record<keyof typeof players, string>
    for (const [key, profile] of Object.entries(players)) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key as keyof typeof players] = row!.id
      await testDb.db.insert(eventMembers).values({ eventId, userId: row!.id })
    }
    const [halo, kart] = await testDb.db.insert(games).values([{ name: 'Halo', createdBy: ids.one }, { name: 'Kart', createdBy: ids.one }]).returning()
    await testDb.db.insert(eventPoolGames).values([{ eventId, gameId: halo!.id }, { eventId, gameId: kart!.id }])

    const [slot] = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId))
    expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slot!.id })).status).toBe(200)
    const seats = [['one', 1], ['two', 1], ['three', 2], ['four', 2]] as const
    for (const [key, team] of seats) {
      expect((await send('POST', `/api/e/${slug}/move`, cookies[key], { userId: ids[key], to: { zone: 'team', team } })).status).toBe(200)
    }
    expect((await send('POST', `/api/e/${slug}/move`, cookies.spectator, { userId: ids.spectator, to: { zone: 'stands' } })).status).toBe(200)
    expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
    const round = await (await send('POST', `/api/e/${slug}/rounds`, hostCookie, { gameId: halo!.id })).json() as { roundId: string }
    expect((await send('PUT', `/api/e/${slug}/rounds/${round.roundId}/result`, hostCookie, { places: [{ team: 1, place: 1 }, { team: 2, place: tie ? 1 : 2 }] })).status).toBe(200)
    if (finish) expect((await send('POST', `/api/e/${slug}/finish`, hostCookie, tie ? { outcome: 'tie', winners: [1, 2] } : { outcome: 'winner', winners: [1] })).status).toBe(200)
    notifier.clear()
    return { slug, eventId, hostCookie, cookies }
  }

  const image = (slug: string, cookie: string | undefined, query = '?format=wide') => send('GET', `/api/e/${slug}/share-image${query}`, cookie)

  async function errorOf(response: Response) {
    return { status: response.status, code: (await response.json() as { statusMessage: string }).statusMessage }
  }

  /** The size a PNG states in its IHDR chunk (bytes 16 to 23, big-endian). */
  function sizeOf(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { signature: [...bytes.slice(0, 8)], width: view.getUint32(16), height: view.getUint32(20) }
  }

  describe('who gets the picture', () => {
    it.each([['wide', 1200, 630], ['square', 1080, 1080]])('gives a Member a PNG of the %s format, %i x %i', async (format, width, height) => {
      const { slug, cookies } = await event()

      const response = await image(slug, cookies.one, `?format=${format}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(sizeOf(new Uint8Array(await response.arrayBuffer()))).toEqual({ signature: PNG_SIGNATURE, width, height })
    }, 30_000)

    it('gives one to every kind of Member: a Player, the Host, a Spectator and a Bench Member', async () => {
      const { slug, cookies, hostCookie } = await event()

      for (const cookie of [cookies.one, cookies.three, hostCookie, cookies.spectator, cookies.bench]) {
        const response = await image(slug, cookie)
        expect(response.status).toBe(200)
        expect(sizeOf(new Uint8Array(await response.arrayBuffer())).signature).toEqual(PNG_SIGNATURE)
      }
    }, 30_000)

    it('gives one for an archived Event too', async () => {
      const { slug, eventId, cookies } = await event()
      await testDb.db.update(events).set({ phase: 'archived' }).where(eq(events.id, eventId))

      expect((await image(slug, cookies.one)).status).toBe(200)
    }, 30_000)

    it('refuses a non-Member exactly as the Event read does, and an unknown slug the same', async () => {
      const { slug, cookies } = await event()

      for (const target of [slug, 'nie-gab-es-k7q2']) {
        const read = await send('GET', `/api/e/${target}`, cookies.outsider)
        const refused = await image(target, cookies.outsider)
        expect(refused.status).toBe(404)
        expect({ status: refused.status, body: await refused.text() }).toEqual({ status: read.status, body: await read.text() })
      }
    })

    it('says nothing about the format to a non-Member', async () => {
      const { slug, cookies } = await event()

      expect((await image(slug, cookies.outsider, '?format=png')).status).toBe(404)
      expect((await image(slug, cookies.outsider, '')).status).toBe(404)
    })

    it('gives a former Member of a deleted Event the 410 of the read', async () => {
      const { slug, cookies } = await event()
      await testDb.db.update(events).set({ deletedAt: new Date() })

      const read = await send('GET', `/api/e/${slug}`, cookies.one)
      const refused = await image(slug, cookies.one)

      expect(refused.status).toBe(410)
      expect({ status: refused.status, body: await refused.text() }).toEqual({ status: read.status, body: await read.text() })
    })

    it('asks a visitor without a session to sign in', async () => {
      const { slug } = await event()

      expect((await image(slug, undefined)).status).toBe(401)
    })
  })

  describe('when and what', () => {
    it.each<Phase>(['draft', 'poll', 'date_set', 'running'])('answers wrong_phase in the Phase %s', async (phase) => {
      const { slug, eventId, cookies } = await event()
      await testDb.db.update(events).set({ phase, finishedAt: null }).where(eq(events.id, eventId))

      expect(await errorOf(await image(slug, cookies.one))).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it('answers wrong_phase for an Event that is running, before any format is checked', async () => {
      const { slug, cookies } = await event({ finish: false })

      expect(await errorOf(await image(slug, cookies.one, '?format=png'))).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it.each([['', 'missing'], ['?format=', 'empty'], ['?format=Wide', 'in capitals'], ['?format=wide&format=square', 'twice'], ['?format=png', 'another format']])('refuses %j (%s) with invalid_value', async (query) => {
      const { slug, cookies } = await event()

      expect(await errorOf(await image(slug, cookies.one, query))).toEqual({ status: 400, code: 'invalid_value' })
    })

    it('says private in Cache-Control and offers no way to keep the picture', async () => {
      const { slug, cookies } = await event()

      const response = await image(slug, cookies.one)

      expect(response.headers.get('cache-control')).toContain('private')
      expect(response.headers.get('cache-control')).not.toMatch(/public|max-age|s-maxage/)
    }, 30_000)

    it('draws the Winner, the Standings and only the game that was played', async () => {
      const { slug, cookies } = await event()

      expect((await image(slug, cookies.one)).status).toBe(200)

      expect(drawn.models).toHaveLength(1)
      const model = drawn.models[0]!
      expect(model.winner).toMatchObject({ name: 'Team Rot', points: '1' })
      expect(model.chips.map(chip => chip.name)).toEqual(['Halo'])
      expect(model.gamesLabel).toBe('1 Spiel')
      expect(model.people).toBe('4 Leute')
      expect(model.pill.event).toBe('Freitags-Zocken')
    }, 30_000)

    // #315: the picture of a Tie, both Parties on rank 1 and the game's two Parties on its first place (the capsule).
    it.each([['wide', 1200, 630], ['square', 1080, 1080]])('gives a PNG of the %s format, %i x %i, for a Tie and draws both Winners', async (format, width, height) => {
      const { slug, cookies } = await event({ tie: true })

      const response = await image(slug, cookies.one, `?format=${format}`)

      expect(response.status).toBe(200)
      expect(sizeOf(new Uint8Array(await response.arrayBuffer()))).toEqual({ signature: PNG_SIGNATURE, width, height })
      const model = drawn.models[0]!
      expect(model.winner).toBeNull()
      expect(model.tie).toMatchObject({ mode: 'names', label: 'Unentschieden · beide gleichauf' })
      expect(model.tie!.entries.map(entry => entry.name)).toEqual(['Team Rot', 'Team Orange'])
      expect(model.chips[0]!.stripes).toHaveLength(2)
      expect(model.rows).toEqual([])
    }, 30_000)

    it('names no Player in what it draws', async () => {
      const { slug, cookies } = await event()
      await image(slug, cookies.one)

      const text = JSON.stringify(drawn.models)

      for (const profile of [host, ...Object.values(players), outsider]) {
        expect(text).not.toContain(profile.name)
        expect(text).not.toContain(profile.email)
      }
    }, 30_000)
  })

  describe('what it stores', () => {
    it('leaves the feed, the room and the Event read as they were', async () => {
      const { slug, eventId, cookies } = await event()
      const readBefore = await (await send('GET', `/api/e/${slug}`, cookies.one)).text()
      const feedBefore = await (await send('GET', `/api/e/${slug}/activity`, cookies.one)).text()
      const rowsBefore = await testDb.db.select().from(activity).where(eq(activity.eventId, eventId))
      notifier.clear()

      expect((await image(slug, cookies.one)).status).toBe(200)
      expect((await image(slug, cookies.one, '?format=square')).status).toBe(200)

      expect(notifier.messages(eventId)).toEqual([])
      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, eventId))).toEqual(rowsBefore)
      expect(await (await send('GET', `/api/e/${slug}/activity`, cookies.one)).text()).toBe(feedBefore)
      expect(await (await send('GET', `/api/e/${slug}`, cookies.one)).text()).toBe(readBefore)
      expect((JSON.parse(readBefore) as EventView).event.phase).toBe('finished')
    }, 30_000)
  })
})
