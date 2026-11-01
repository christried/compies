import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import pauseCountdown from '../../server/api/e/[slug]/countdown/pause.post'
import resetCountdown from '../../server/api/e/[slug]/countdown/reset.post'
import startCountdown from '../../server/api/e/[slug]/countdown/start.post'
import setCountdown from '../../server/api/e/[slug]/countdown/index.put'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import { countdowns, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { EventView } from '../../shared/event'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { startRunningSession } from './running-session'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Countdown (#236, spec #218 § Countdown): the Host sets it in minutes and seconds (5 s to 99:59), starts, pauses, resumes
// and resets it, during a running Session only, through the HTTP API with a test clock and the in-memory room. Every Member reads
// the same Countdown in the Event read; ending the Session clears it. The rules themselves are unit-tested in countdown.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'
const SECOND = 1000

describe('Countdown', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'POST /api/e': createEvent,
      'GET /api/e/:slug': readEvent,
      'POST /api/e/:slug/confirm': confirmDate,
      'POST /api/e/:slug/move': moveMember,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/sessions/end': endSession,
      'PUT /api/e/:slug/countdown': setCountdown,
      'POST /api/e/:slug/countdown/start': startCountdown,
      'POST /api/e/:slug/countdown/pause': pauseCountdown,
      'POST /api/e/:slug/countdown/reset': resetCountdown,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
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

  const setSeconds = (game: Event, seconds: unknown, cookie = game.hostCookie) => send('PUT', `/api/e/${game.slug}/countdown`, cookie, { seconds })
  const act = (game: Event, action: 'start' | 'pause' | 'reset', cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/countdown/${action}`, cookie)
  const readCountdown = async (game: Event, cookie = game.hostCookie) => (await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView).countdown
  const countdownRow = async (game: Event) => (await testDb.db.select().from(countdowns).where(eq(countdowns.eventId, game.eventId)))[0]

  describe('setting it', () => {
    it('refuses a length below 5 seconds or above 99:59 with invalid_value, and stores nothing', async () => {
      const game = await event()

      expect(await errorOf(await setSeconds(game, 4))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await setSeconds(game, 6000))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await setSeconds(game, 'sixty'))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await countdownRow(game)).toBeUndefined()
    })

    it('accepts 5 seconds and 99:59 (5999 seconds) as ready, at their full duration', async () => {
      const game = await event()

      const short = await setSeconds(game, 5)
      expect(short.status).toBe(200)
      expect(await short.json()).toEqual({ durationMs: 5 * SECOND, remainingMs: 5 * SECOND, startedAt: null })

      const long = await setSeconds(game, 5999)
      expect(long.status).toBe(200)
      expect(await readCountdown(game)).toEqual({ durationMs: 5999 * SECOND, remainingMs: 5999 * SECOND, startedAt: null })
    })

    it('replaces a paused or ended Countdown, but not a running one', async () => {
      const game = await event()
      await setSeconds(game, 60)
      await act(game, 'start')
      expect(await errorOf(await setSeconds(game, 30))).toEqual({ status: 409, code: 'countdown_running' })

      await act(game, 'pause')
      expect((await setSeconds(game, 30)).status).toBe(200)
      expect(await readCountdown(game)).toEqual({ durationMs: 30 * SECOND, remainingMs: 30 * SECOND, startedAt: null })
    })
  })

  describe('the transitions', () => {
    it('starts from ready: the read shows it running from the server clock, with its full time', async () => {
      const game = await event()
      await setSeconds(game, 60)

      const response = await act(game, 'start')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ durationMs: 60 * SECOND, remainingMs: 60 * SECOND, startedAt: new Date(T0).toISOString() })
    })

    it('pauses with the time that is left at that moment, and resumes from it', async () => {
      const game = await event()
      await setSeconds(game, 60)
      await act(game, 'start')

      clock.advance(10 * SECOND)
      expect(await (await act(game, 'pause')).json()).toEqual({ durationMs: 60 * SECOND, remainingMs: 50 * SECOND, startedAt: null })

      const resumed = await act(game, 'start')
      const resumedAt = new Date(new Date(T0).getTime() + 10 * SECOND).toISOString()
      expect(await resumed.json()).toEqual({ durationMs: 60 * SECOND, remainingMs: 50 * SECOND, startedAt: resumedAt })

      clock.advance(20 * SECOND)
      expect(await (await act(game, 'pause')).json()).toEqual({ durationMs: 60 * SECOND, remainingMs: 30 * SECOND, startedAt: null })
    })

    it('runs out: past its end the read shows it at zero, and start is refused as ended', async () => {
      const game = await event()
      await setSeconds(game, 30)
      await act(game, 'start')

      clock.advance(31 * SECOND)

      expect(await errorOf(await act(game, 'start'))).toEqual({ status: 409, code: 'countdown_ended' })
      const countdown = await readCountdown(game)
      expect(countdown).toMatchObject({ durationMs: 30 * SECOND, startedAt: new Date(T0).toISOString() })
      expect(countdown!.remainingMs).toBe(30 * SECOND)
      expect(new Date(countdown!.startedAt!).getTime() + countdown!.remainingMs).toBe(new Date(T0).getTime() + 30 * SECOND)
    })

    it('resets to ready with the full duration, from paused or ended', async () => {
      const game = await event()
      await setSeconds(game, 60)
      await act(game, 'start')
      clock.advance(20 * SECOND)
      await act(game, 'pause')

      const response = await act(game, 'reset')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ durationMs: 60 * SECOND, remainingMs: 60 * SECOND, startedAt: null })
    })

    it('refuses pause while it does not run, and start while it runs', async () => {
      const game = await event()
      await setSeconds(game, 60)
      expect(await errorOf(await act(game, 'pause'))).toEqual({ status: 409, code: 'countdown_not_running' })

      await act(game, 'start')
      expect(await errorOf(await act(game, 'start'))).toEqual({ status: 409, code: 'countdown_running' })
      await act(game, 'pause')
      expect(await errorOf(await act(game, 'pause'))).toEqual({ status: 409, code: 'countdown_not_running' })
    })
  })

  describe('who and when', () => {
    it('lets only the Host change it: every endpoint answers a Member with 403 not_host', async () => {
      const game = await event()
      await setSeconds(game, 60)

      expect(await errorOf(await setSeconds(game, 30, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await errorOf(await act(game, 'start', game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await errorOf(await act(game, 'pause', game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await errorOf(await act(game, 'reset', game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
    })

    it('needs a running Session for every endpoint: no_running_session before any Session started', async () => {
      const game = await event({ running: false })

      expect(await errorOf(await setSeconds(game, 60))).toEqual({ status: 409, code: 'no_running_session' })
      expect(await errorOf(await act(game, 'start'))).toEqual({ status: 409, code: 'no_running_session' })
      expect(await errorOf(await act(game, 'pause'))).toEqual({ status: 409, code: 'no_running_session' })
      expect(await errorOf(await act(game, 'reset'))).toEqual({ status: 409, code: 'no_running_session' })
    })

    it('is cleared when the Session ends: the row is gone and the read shows none', async () => {
      const game = await event()
      await setSeconds(game, 60)
      await act(game, 'start')
      expect(await readCountdown(game)).not.toBeNull()

      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)

      expect(await countdownRow(game)).toBeUndefined()
      expect(await readCountdown(game)).toBeNull()
    })

    it('shows the same Countdown to every Member, the Host and a Member alike', async () => {
      const game = await event()
      await setSeconds(game, 60)
      await act(game, 'start')

      const asHost = await readCountdown(game)
      const asMember = await readCountdown(game, game.cookies.two)

      expect(asMember).toEqual(asHost)
      expect(asHost).toEqual({ durationMs: 60 * SECOND, remainingMs: 60 * SECOND, startedAt: new Date(T0).toISOString() })
    })

    it('shows none before a Countdown is set', async () => {
      const game = await event()
      expect(await readCountdown(game)).toBeNull()
    })

    it('publishes countdown.changed for every change to the Event room', async () => {
      const game = await event()

      await setSeconds(game, 60)
      await act(game, 'start')
      await act(game, 'pause')
      await act(game, 'reset')

      const types = notifier.messages(game.eventId).map(message => message.type)
      expect(types.filter(type => type === 'countdown.changed')).toHaveLength(4)
      expect(types).not.toContain('activity.added')
    })
  })
})
