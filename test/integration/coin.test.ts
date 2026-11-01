import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import tossCoin from '../../server/api/e/[slug]/coin.post'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import { activity, coinTosses, countdowns, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityPage } from '../../shared/activity'
import type { CoinTossed, EventView } from '../../shared/event'
import { COIN_DURATION_MS, COIN_LEAD_MS } from '../../shared/coin'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { startRunningSession } from './running-session'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Coin flip (#235, spec #218 § Coin flip): the Host tosses a coin in a running Session, through the HTTP API with a test clock and
// the in-memory room. The server picks the side and the toss lands at the same instant for everyone; the feed shows the entry only from
// the landing on, and the Event read shows the toss to every Member while the Session runs. The rules are unit-tested in coin.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'
const T0_MS = Date.parse(T0)
const STARTS = T0_MS + COIN_LEAD_MS
const LANDS = STARTS + COIN_DURATION_MS

describe('the Coin flip (#235)', () => {
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
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/move': moveMember,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/sessions/end': endSession,
      'POST /api/e/:slug/coin': tossCoin,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await testDb.db.delete(coinTosses)
    await testDb.db.delete(activity)
    await testDb.db.delete(countdowns)
    await testDb.db.delete(draws)
    await testDb.db.delete(rounds)
    await testDb.db.delete(eventPoolGames)
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

  async function errorOf(response: Response) {
    return { status: response.status, code: (await response.json() as { statusMessage: string }).statusMessage }
  }

  /** An Event with a Host and two Members. `running` starts its first Session (both Members seated in a team each). */
  async function event({ running = true }: { running?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = {
      one: (await signIn(testDb.db, players.one)).cookie,
      two: (await signIn(testDb.db, players.two)).cookie,
    }
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS, settings: TEST_SETTINGS })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    for (const profile of [players.one, players.two]) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: row!.id })
    }
    if (running) {
      await startRunningSession(request, testDb.db, {
        slug,
        hostCookie,
        seated: [{ cookie: cookies.one, email: players.one.email }, { cookie: cookies.two, email: players.two.email }],
      })
    }
    notifier.clear()
    return { slug, eventId: eventRow!.id, hostCookie, cookies }
  }

  type Event = Awaited<ReturnType<typeof event>>

  const toss = (game: Event, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/coin`, cookie)
  const feedOf = async (game: Event, cookie: string) => (await (await send('GET', `/api/e/${game.slug}/activity?limit=100`, cookie)).json() as ActivityPage).entries
  const readCoin = async (game: Event, cookie = game.hostCookie) => (await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView).coin
  const messagesOf = (game: Event) => notifier.messages(game.eventId)

  describe('tossing it', () => {
    it('refuses a Member, who is not the Host, with not_host', async () => {
      const game = await event()

      expect(await errorOf(await toss(game, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await coinRows(game)).toEqual([])
    })

    it('refuses without a running Session with no_running_session', async () => {
      const game = await event({ running: false })

      expect(await errorOf(await toss(game))).toEqual({ status: 409, code: 'no_running_session' })
      expect(await coinRows(game)).toEqual([])
    })

    it('answers the side the server picked and the instants: the flight starts 1.5 s after the commit and lands 3.6 s later', async () => {
      const game = await event()

      const response = await toss(game)
      expect(response.status).toBe(200)
      const body = await response.json() as CoinTossed
      expect(['heads', 'tails']).toContain(body.side)
      expect(body).toEqual({ tossId: expect.any(String), side: body.side, startedAt: new Date(STARTS).toISOString(), landsAt: new Date(LANDS).toISOString() })
      const [row] = await coinRows(game)
      expect(row).toMatchObject({ id: body.tossId, side: body.side, tossedBy: expect.any(String) })
    })

    it('refuses a second toss while the first flies with coin_in_air, and accepts a new one once it has landed', async () => {
      const game = await event()
      await toss(game)

      clock.set(new Date(LANDS - 1))
      expect(await errorOf(await toss(game))).toEqual({ status: 409, code: 'coin_in_air' })

      clock.set(new Date(LANDS))
      expect((await toss(game)).status).toBe(200)
      expect(await coinRows(game)).toHaveLength(2)
    })
  })

  describe('what the Members get', () => {
    it('sends the toss with its side and instants in the room, and no feed message, since the feed waits for the landing', async () => {
      const game = await event()

      const body = await (await toss(game)).json() as CoinTossed
      expect(messagesOf(game).map(message => message.type)).toEqual(['event.changed', 'coin.tossed'])
      expect(messagesOf(game)[1]).toMatchObject({ type: 'coin.tossed', tossId: body.tossId, side: body.side, startedAt: body.startedAt, landsAt: body.landsAt })
    })

    it('shows the entry in the feed only from the landing on, to a Member', async () => {
      const game = await event()
      const body = await (await toss(game)).json() as CoinTossed

      clock.set(new Date(LANDS - 1))
      expect((await feedOf(game, game.cookies.one)).map(entry => entry.type)).not.toContain('coin_tossed')

      clock.set(new Date(LANDS))
      const entries = await feedOf(game, game.cookies.one)
      expect(entries.find(entry => entry.type === 'coin_tossed')).toMatchObject({ type: 'coin_tossed', at: body.landsAt, params: { side: body.side } })
    })

    it('shows the toss in the Event read to every Member while the Session runs, and nothing once it has ended', async () => {
      const game = await event()
      const body = await (await toss(game)).json() as CoinTossed

      expect(await readCoin(game, game.cookies.one)).toEqual({ id: body.tossId, side: body.side, startedAt: body.startedAt, landsAt: body.landsAt })
      expect(await readCoin(game)).toEqual({ id: body.tossId, side: body.side, startedAt: body.startedAt, landsAt: body.landsAt })

      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      expect(await readCoin(game, game.cookies.one)).toBeNull()
    })
  })

  async function coinRows(game: Event) {
    return testDb.db.select().from(coinTosses).where(eq(coinTosses.eventId, game.eventId))
  }
})
