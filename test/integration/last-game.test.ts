import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import putResult from '../../server/api/e/[slug]/rounds/[id]/result.put'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import joinInvite from '../../server/api/invite/[invite].post'
import { activity, countdowns, eventMembers, eventPoolGames, events, games, pollSlots, roundPlaces, rounds, sessions, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The last game (#278, spec #272): `POST /api/e/:slug/last-game` raises the Game count by one while the Standings hold a Tie. This file
// covers what the Host reads about it (`end.lastGame`) and, from its route on, the raise itself. The helper that seats an Event and starts
// its first Session is the one of finish.test.ts, copied here.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
} as const
const newcomer = { provider: 'twitch', id: '7', name: 'Neu', email: 'neu@example.com', image: undefined } as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00', '2090-11-01T19:00']
const T0 = '2090-10-30T10:00:00.000Z'

describe('The last game', () => {
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
      'POST /api/e/:slug/rounds': setGame,
      'PUT /api/e/:slug/rounds/:id/result': putResult,
      'POST /api/invite/:invite': joinInvite,
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
   * A running Event: `teams` Parties (2: two Players in each of teams 1 and 2; 3: one Player in each of teams 1 to 3), `sessions` Sessions,
   * of which the first `confirmed` Slots have a Date. The first Session is started. Games: Halo and Kart in the Game pool, Schach in the library.
   */
  async function running({ teams = 2, gameCount = 2, sessions: sessionCount = 2, confirmed = sessionCount }: { teams?: 2 | 3, gameCount?: number, sessions?: number, confirmed?: number } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies: Partial<Record<keyof typeof players, string>> = {}
    for (const [key, profile] of Object.entries(players)) cookies[key as keyof typeof players] = (await signIn(testDb.db, profile)).cookie
    const pointsTable = { preset: 'linear' as const, values: teams === 2 ? [1, 0] : [2, 1, 0] }
    const settings = { ...TEST_SETTINGS, teamCount: teams, teamSize: teams === 2 ? 2 : 1, gameCount, pointsTable }
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: sessionCount, slots: SLOTS.slice(0, sessionCount), settings })
    const { slug, inviteUrl } = await created.json() as { slug: string, inviteUrl: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const eventId = eventRow!.id
    const ids = {} as Record<'host' | keyof typeof players, string>
    for (const [key, profile] of Object.entries({ host, ...players })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key as keyof typeof ids] = row!.id
    }
    const seated = teams === 2
      ? [['one', 1], ['two', 1], ['three', 2], ['four', 2]] as const
      : [['one', 1], ['two', 2], ['three', 3]] as const
    for (const [key] of seated) await testDb.db.insert(eventMembers).values({ eventId, userId: ids[key] })

    const inserted = await testDb.db.insert(games).values([
      { name: 'Halo', createdBy: ids.host },
      { name: 'Kart', createdBy: ids.host },
      { name: 'Schach', createdBy: ids.host },
    ]).returning()
    const [halo, kart, schach] = inserted as [typeof inserted[number], typeof inserted[number], typeof inserted[number]]
    await testDb.db.insert(eventPoolGames).values([
      { eventId, gameId: halo.id, pool: 'main' },
      { eventId, gameId: kart.id, pool: 'main' },
    ])

    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
    for (const slotId of slotIds.slice(0, confirmed)) expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId })).status).toBe(200)
    for (const [key, position] of seated) {
      const to: Place = { zone: 'team', team: position }
      expect((await send('POST', `/api/e/${slug}/move`, cookies[key], { userId: ids[key], to })).status).toBe(200)
    }
    expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
    await testDb.db.delete(activity)
    notifier.clear()
    return { slug, eventId, hostCookie, cookies, ids, halo, kart, schach, inviteUrl }
  }

  type Game = Awaited<ReturnType<typeof running>>

  const read = async (game: Game, cookie = game.hostCookie) => await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView
  const set = (game: Game, gameId: string) => send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, { gameId })
  const setRound = async (game: Game, gameId: string) => (await (await set(game, gameId)).json() as { roundId: string }).roundId
  const enter = (game: Game, roundId: string, body: unknown, cookie = game.hostCookie) => send('PUT', `/api/e/${game.slug}/rounds/${roundId}/result`, cookie, body)

  /** Party 1 wins the Result: one for team 1 first, team 2 second. */
  const teamOneWins = [{ team: 1, place: 1 }, { team: 2, place: 2 }]
  /** Party 2 wins it. */
  const teamTwoWins = [{ team: 2, place: 1 }, { team: 1, place: 2 }]

  describe('what the Host reads', () => {
    it('shows the Host why the last game cannot be added, and every other viewer nothing', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      const { cookie: benchCookie } = await signIn(testDb.db, newcomer)
      await send('POST', `/api/invite/${new URL(game.inviteUrl).pathname.slice('/e/'.length)}`, benchCookie)

      expect((await read(game)).end).toMatchObject({ complete: false, lastGame: { rejection: 'results_missing' } })
      expect((await read(game, game.cookies.one)).end).toMatchObject({ lastGame: null })
      expect((await read(game, benchCookie)).end).toMatchObject({ lastGame: null })

      const second = await setRound(game, game.kart.id)
      expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ complete: true, tie: [1, 2], lastGame: { rejection: null } })
      expect((await read(game, game.cookies.two)).end).toMatchObject({ lastGame: null })

      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ complete: true, tie: null, lastGame: { rejection: 'no_tie' } })
    })
  })
})
