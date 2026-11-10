import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, events } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { fileShareAssets } from '../../server/utils/share-assets'
import type { EventView } from '../../shared/event'
import type { Phase } from '../../shared/phase'
import type { ShareImageModel } from '../../shared/share-image'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostEntersResult, hostFinishes, hostSets, readEventText, readFeedText, startRunningEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

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
  // Not on a team: one Member who moved to the Stands, one who took no seat (both on the Stands).
  spectator: { provider: 'twitch', id: '6', name: 'Zuschauer', email: 'spectator@example.com', image: undefined },
  unseated: { provider: 'twitch', id: '7', name: 'Bank', email: 'unseated@example.com', image: undefined },
} as const
const outsider = { provider: 'twitch', id: '8', name: 'Fremd', email: 'outsider@example.com', image: undefined } as const

const T0 = '2090-10-30T10:00:00.000Z'
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

describe('the Share image route', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock, shareAssets: fileShareAssets() })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    drawn.models = []
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => request)

  /**
   * An Event with one Session, two Parties of two Players, a Member on the Stands and one who took no seat, and a pool of two games of which only Halo is
   * played (Kart stays in the pool). `finish: false` leaves it running with its result in; the Host's cookie, the Members' and an outsider's come back.
   */
  async function event({ finish = true, tie = false }: { finish?: boolean, tie?: boolean } = {}) {
    const game = await startRunningEvent(rig, {
      host, players, outsiders: { outsider }, sessions: 1,
      seats: [['one', 1], ['two', 1], ['three', 2], ['four', 2], ['spectator', 'stands']] as const,
      settings: { teamCount: 2, teamSize: 2, gameCount: 1, pointsTable: { preset: 'linear' as const, values: [1, 0] } },
      games: [{ key: 'halo', values: { name: 'Halo' }, pool: true }, { key: 'kart', values: { name: 'Kart' }, pool: true }],
    })
    const roundId = await hostSets(rig, game, game.games.halo.id)
    await hostEntersResult(rig, game, roundId, [{ team: 1, place: 1 }, { team: 2, place: tie ? 1 : 2 }])
    if (finish) await hostFinishes(rig, game, tie ? { outcome: 'tie', winners: [1, 2] } : { outcome: 'winner', winners: [1] })
    notifier.clear()
    const cookies = {
      one: game.players.one.cookie, two: game.players.two.cookie, three: game.players.three.cookie, four: game.players.four.cookie,
      spectator: game.players.spectator.cookie, unseated: game.players.unseated.cookie, outsider: game.outsiders.outsider.cookie,
    }
    return { slug: game.slug, eventId: game.eventId, hostCookie: game.host.cookie, cookies }
  }

  const image = (slug: string, cookie: string | undefined, query = '?format=wide') => send('GET', `/api/e/${slug}/share-image${query}`, cookie)

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

    it('gives one to every kind of Member: a Player, the Host and a Member on the Stands', async () => {
      const { slug, cookies, hostCookie } = await event()

      for (const cookie of [cookies.one, cookies.three, hostCookie, cookies.spectator, cookies.unseated]) {
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
      const readBefore = await readEventText(rig, cookies.one, slug)
      const feedBefore = await readFeedText(rig, cookies.one, slug)
      const rowsBefore = await testDb.db.select().from(activity).where(eq(activity.eventId, eventId))
      notifier.clear()

      expect((await image(slug, cookies.one)).status).toBe(200)
      expect((await image(slug, cookies.one, '?format=square')).status).toBe(200)

      expect(notifier.messages(eventId)).toEqual([])
      expect(await testDb.db.select().from(activity).where(eq(activity.eventId, eventId))).toEqual(rowsBefore)
      expect(await readFeedText(rig, cookies.one, slug)).toBe(feedBefore)
      expect(await readEventText(rig, cookies.one, slug)).toBe(readBefore)
      expect((JSON.parse(readBefore) as EventView).event.phase).toBe('finished')
    }, 30_000)
  })
})
