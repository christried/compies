import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { coinTosses, pollSlots, sessions, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityPage } from '../../shared/activity'
import type { EventView } from '../../shared/event'
import type { CoinTossed } from '../../shared/stage'
import { COIN_DURATION_MS, COIN_LEAD_MS } from '../../shared/coin'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { startRunningEvent, type Stage } from './scenario'
import { stubAuthEnv } from './sign-in'

// The Coin flip (#235, spec #218 § Coin flip): the Host tosses a coin in a running Session, through the HTTP API with a test clock and
// the in-memory room. The server picks the side and the toss lands at the same instant for everyone; the feed shows the entry only from
// the landing on, and the Event read shows the toss to every Member while the Session runs. The rules are unit-tested in coin.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const T0 = '2090-10-30T10:00:00.000Z'
const T0_MS = Date.parse(T0)
const STARTS = T0_MS + COIN_LEAD_MS
const LANDS = STARTS + COIN_DURATION_MS

describe('the Coin flip (#235)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let stage: Stage
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock })
    stage = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => request)

  /** An Event with a Host and two Members. `running` starts its first Session (both Members seated in a team each). */
  async function event({ running = true }: { running?: boolean } = {}) {
    const ev = await startRunningEvent(stage, {
      host,
      players,
      seats: running ? [['one', 1], ['two', 2]] : [],
      confirmed: running ? 1 : 0,
      start: running,
    })
    return { slug: ev.slug, eventId: ev.eventId, hostCookie: ev.host.cookie, cookies: { one: ev.players.one.cookie, two: ev.players.two.cookie } }
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
    it('tells the room only that the Event changed, and sends no feed message, since the feed waits for the landing', async () => {
      const game = await event()

      await toss(game)
      expect(messagesOf(game).map(message => message.type)).toEqual(['event.changed'])
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

  describe('a toss belongs to its Session (#259)', () => {
    /** Ends the running Session, confirms the second Slot and starts Session 2 at the clock's current instant. */
    async function startSecondSession(game: Event) {
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      const slots = await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, game.eventId)).orderBy(pollSlots.startsAt)
      expect((await send('POST', `/api/e/${game.slug}/confirm`, game.hostCookie, { slotId: slots[1]!.id })).status).toBe(200)
      expect((await send('POST', `/api/e/${game.slug}/sessions/start`, game.hostCookie)).status).toBe(200)
    }

    it('starts a new Session without the previous Session\'s toss, and the Host can toss again at once', async () => {
      const game = await event()
      const first = await (await toss(game)).json() as CoinTossed
      expect(await readCoin(game)).toMatchObject({ id: first.tossId })

      // The new Session starts after the old toss landed: no time comparison may bring the toss back.
      clock.set(new Date(LANDS))
      await startSecondSession(game)
      expect(await readCoin(game)).toBeNull()

      const second = await toss(game)
      expect(second.status).toBe(200)
      expect(await readCoin(game)).toMatchObject({ id: (await second.json() as CoinTossed).tossId })
    })

    it('stamps the toss with the Running Session', async () => {
      const game = await event()
      await toss(game)

      const [running] = await testDb.db.select().from(sessions).where(eq(sessions.eventId, game.eventId)).orderBy(sessions.startsAt)
      expect((await coinRows(game)).map(row => row.sessionId)).toEqual([running!.id])
    })

    it('stamps the start and the end of a Session with the request clock, not the database clock', async () => {
      const game = await event()
      clock.advance(10 * 60_000)
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)

      const view = await (await send('GET', `/api/e/${game.slug}`, game.hostCookie)).json() as EventView
      const ended = view.sessions.find(session => session.endedAt !== null)
      expect(ended).toMatchObject({ startedAt: T0, endedAt: new Date(T0_MS + 10 * 60_000).toISOString() })
    })

    it('shows a toss without a Session in none, as the 0.7 code writes it during the switch-over', async () => {
      const game = await event()
      const [hostRow] = await testDb.db.select().from(users).where(eq(users.email, host.email))
      await testDb.db.insert(coinTosses).values({ eventId: game.eventId, side: 'heads', tossedBy: hostRow!.id, startedAt: new Date(STARTS), landsAt: new Date(LANDS) })

      expect(await readCoin(game)).toBeNull()

      clock.set(new Date(LANDS))
      const real = await toss(game)
      expect(real.status).toBe(200)
      expect(await readCoin(game)).toMatchObject({ id: (await real.json() as CoinTossed).tossId })
    })
  })

  async function coinRows(game: Event) {
    return testDb.db.select().from(coinTosses).where(eq(coinTosses.eventId, game.eventId))
  }
})
