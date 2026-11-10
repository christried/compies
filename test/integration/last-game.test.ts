import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, events, games, roundPlaces, rounds } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { GAME_COUNT_MAX } from '../../shared/settings'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, resetDatabase } from './harness'
import { readEvent, readFeed, startRunningEvent, type Rig } from './scenario'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The last game (#278, spec #272): `POST /api/e/:slug/last-game` raises the Game count by one while the Standings hold a Tie. This file
// covers what the Host reads about it (`end.lastGame`), the raise and its refusals, a double press, a Tie that stays or breaks after the
// raise, and the Game count at its maximum. The helper that seats an Event and starts its first Session is the one of finish.test.ts, copied here.

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
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock })
    rig = { request, db: testDb.db, clock, notifier }
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

  /**
   * A running Event: two Parties of two Players (one and two in team 1, three and four in team 2), `sessions` Sessions, of which the first
   * `confirmed` Slots have a Date. The first Session is started. Games: Halo and Kart in the Game pool, Schach in the library.
   */
  async function running({ gameCount = 2, sessions: sessionCount = 2, confirmed = sessionCount }: { gameCount?: number, sessions?: number, confirmed?: number } = {}) {
    const ev = await startRunningEvent(rig, {
      host,
      players,
      seats: [['one', 1], ['two', 1], ['three', 2], ['four', 2]],
      sessions: sessionCount,
      slots: SLOTS.slice(0, sessionCount),
      confirmed,
      settings: { teamCount: 2, teamSize: 2, gameCount, pointsTable: { preset: 'linear', values: [1, 0] } },
      games: [
        { key: 'halo', values: { name: 'Halo' }, pool: true },
        { key: 'kart', values: { name: 'Kart' }, pool: true },
        { key: 'schach', values: { name: 'Schach' }, pool: false },
      ],
      quiet: 'room-and-feed',
    })
    const cookies = { one: ev.players.one.cookie, two: ev.players.two.cookie, three: ev.players.three.cookie, four: ev.players.four.cookie }
    const ids = { host: ev.host.id, one: ev.players.one.id, two: ev.players.two.id, three: ev.players.three.id, four: ev.players.four.id }
    return { slug: ev.slug, eventId: ev.eventId, hostCookie: ev.host.cookie, cookies, ids, halo: ev.games.halo, kart: ev.games.kart, schach: ev.games.schach, inviteToken: ev.inviteToken }
  }

  type Game = Awaited<ReturnType<typeof running>>

  const read = (game: Game, cookie = game.hostCookie) => readEvent(rig, cookie, game.slug)
  const set = (game: Game, gameId: string) => send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, { gameId })
  const setRound = async (game: Game, gameId: string) => (await (await set(game, gameId)).json() as { roundId: string }).roundId
  const enter = (game: Game, roundId: string, body: unknown, cookie = game.hostCookie) => send('PUT', `/api/e/${game.slug}/rounds/${roundId}/result`, cookie, body)
  const finish = (game: Game, body: unknown = { outcome: 'winner', winners: [1] }, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/finish`, cookie, body)
  const addLastGame = (game: Game, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/last-game`, cookie)
  const eventRowOf = async (eventId: string) => (await testDb.db.select().from(events).where(eq(events.id, eventId)))[0]!
  const activityTypes = async (eventId: string) => (await testDb.db.select({ type: activity.type }).from(activity).where(eq(activity.eventId, eventId))).map(row => row.type).sort()
  const types = (eventId: string) => notifier.messages(eventId).map(message => message.type)

  /** Party 1 wins the Result: one for team 1 first, team 2 second. */
  const teamOneWins = [{ team: 1, place: 1 }, { team: 2, place: 2 }]
  /** Party 2 wins it. */
  const teamTwoWins = [{ team: 2, place: 1 }, { team: 1, place: 2 }]
  /** Both Parties on Place 1: a Shared place, one point each (linear table). */
  const level = [{ team: 1, place: 1 }, { team: 2, place: 1 }]

  /** A running two-Party Event at Game count 2 with a Tie: one Result for each Party, the Game count reached (#278). */
  async function tied() {
    const game = await running({ gameCount: 2 })
    const first = await setRound(game, game.halo.id)
    const second = await setRound(game, game.kart.id)
    expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
    expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)
    notifier.clear()
    return game
  }

  describe('what the Host reads', () => {
    it('shows the Host why the last game cannot be added, and every other viewer nothing', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      const { cookie: benchCookie } = await signIn(testDb.db, newcomer)
      await send('POST', `/api/invite/${game.inviteToken}`, benchCookie)

      expect((await read(game)).end).toMatchObject({ complete: false, lastGame: { rejection: 'results_missing' } })
      expect((await read(game, game.cookies.one)).end).toMatchObject({ lastGame: null })
      expect((await read(game, benchCookie)).end).toMatchObject({ lastGame: null })

      const second = await setRound(game, game.kart.id)
      expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ complete: true, tie: [1, 2], lastGame: { rejection: null } })
      expect((await read(game, game.cookies.two)).end).toMatchObject({ lastGame: null })

      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ complete: true, tie: null, lastGame: { rejection: 'no_tie' } })
      expect(await errorOf(await addLastGame(game))).toEqual({ status: 409, code: 'no_tie' })
    })
  })

  describe('raising the Game count', () => {
    it('raises the count by one from a Tie: the new count, one feed entry with the Host as actor, and the room hears of it', async () => {
      const game = await tied()
      const activityBefore = await activityTypes(game.eventId)

      const response = await addLastGame(game)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ gameCount: 3 })
      expect(await eventRowOf(game.eventId)).toMatchObject({ gameCount: 3 })
      expect(await activityTypes(game.eventId)).toEqual([...activityBefore, 'game_count_changed'].sort())
      expect((await readFeed(rig, game.hostCookie, game.slug))[0]).toMatchObject({ type: 'game_count_changed', actor: { id: game.ids.host }, params: { from: 2, to: 3 } })
      expect(types(game.eventId)).toEqual(['event.changed', 'activity.added'])
      expect((await read(game)).settings).toMatchObject({ gameCount: 3 })
      expect((await read(game)).end).toMatchObject({ played: 2, gameCount: 3, complete: false, tie: null })
    })

    it('lets exactly one of two presses at once through: the second finds the count incomplete and answers results_missing', async () => {
      const game = await tied()

      const [a, b] = await Promise.all([addLastGame(game), addLastGame(game)])

      expect([a.status, b.status].sort()).toEqual([200, 409])
      const refused = a.status === 409 ? a : b
      expect(await errorOf(refused)).toEqual({ status: 409, code: 'results_missing' })
      expect(await eventRowOf(game.eventId)).toMatchObject({ gameCount: 3 })
      expect((await activityTypes(game.eventId)).filter(type => type === 'game_count_changed')).toHaveLength(1)
    })

    it('a last game that breaks the Tie: the Host finishes with a winner, and not as a Tie', async () => {
      const game = await tied()
      expect((await addLastGame(game)).status).toBe(200)
      const third = await setRound(game, game.schach.id)
      expect((await enter(game, third, { places: teamOneWins })).status).toBe(200)

      expect((await read(game)).end).toMatchObject({ played: 3, gameCount: 3, complete: true, tie: null })
      expect((await read(game)).standings).toEqual([{ team: 1, rank: 1, points: 2 }, { team: 2, rank: 2, points: 1 }])
      expect(await errorOf(await finish(game, { outcome: 'tie', winners: [1, 2] }))).toEqual({ status: 409, code: 'standings_changed' })
      expect(await (await finish(game, { outcome: 'winner', winners: [1] })).json()).toEqual({ phase: 'finished', winners: [1] })
    })

    it('a last game that stays level: the same choice comes up again, a second last game is added, and the Tie is finished', async () => {
      const game = await tied()
      expect((await addLastGame(game)).status).toBe(200)
      const third = await setRound(game, game.schach.id)
      expect((await enter(game, third, { places: level })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ played: 3, gameCount: 3, complete: true, tie: [1, 2], lastGame: { rejection: null } })

      expect(await (await addLastGame(game)).json()).toEqual({ gameCount: 4 })
      const [tetris] = await testDb.db.insert(games).values({ name: 'Tetris', createdBy: game.ids.host }).returning()
      const fourth = await setRound(game, tetris!.id)
      expect((await enter(game, fourth, { places: level })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ played: 4, gameCount: 4, complete: true, tie: [1, 2] })
      expect(await (await finish(game, { outcome: 'tie', winners: [1, 2] })).json()).toEqual({ phase: 'finished', winners: [1, 2] })
    })
  })

  describe('refusals, in order', () => {
    it('refuses a Player with not_host, and writes nothing', async () => {
      const game = await tied()
      const before = await eventRowOf(game.eventId)

      expect(await errorOf(await addLastGame(game, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(types(game.eventId)).toEqual([])
    })

    it('refuses the Host in an Event that is not running (the Date poll) with wrong_phase', async () => {
      setAllowlist({ hosts: 'discord:1' })
      const { cookie } = await signIn(testDb.db, host)
      const created = await send('POST', '/api/e', cookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: SLOTS.slice(0, 1), settings: { ...TEST_SETTINGS, gameCount: 2 } })
      const { slug } = await created.json() as { slug: string }
      const [pollEvent] = await testDb.db.select().from(events).where(eq(events.slug, slug))
      const before = await eventRowOf(pollEvent!.id)

      expect(await errorOf(await send('POST', `/api/e/${slug}/last-game`, cookie))).toEqual({ status: 409, code: 'wrong_phase' })
      expect(await eventRowOf(pollEvent!.id)).toEqual(before)
    })

    it('refuses the Host in an Event that is not set up with wrong_phase (#288: the rule\'s order, after the settings are read)', async () => {
      const game = await running()
      await testDb.db.update(events).set({ teamCount: null }).where(eq(events.id, game.eventId))

      expect(await errorOf(await addLastGame(game))).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it('refuses fewer Results than the Game count with results_missing, and writes nothing', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      const before = await eventRowOf(game.eventId)
      notifier.clear()

      expect(await errorOf(await addLastGame(game))).toEqual({ status: 409, code: 'results_missing' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(types(game.eventId)).toEqual([])
    })

    it('refuses a sole leader with no_tie, and writes nothing', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      const before = await eventRowOf(game.eventId)
      notifier.clear()

      expect(await errorOf(await addLastGame(game))).toEqual({ status: 409, code: 'no_tie' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(types(game.eventId)).toEqual([])
    })
  })

  describe('at the Game count maximum', () => {
    /** Seeds `count` Rounds with a Result straight into the database, odd numbers won by team 1 and even ones by team 2: a Tie of both (the test's setup). */
    async function seedAlternating(game: Game, count: number) {
      const inserted = await testDb.db.insert(rounds).values(Array.from({ length: count }, (_, index) => ({
        eventId: game.eventId,
        gameId: game.halo.id,
        startedAt: new Date(T0),
        setAt: new Date(T0),
        number: index + 1,
        resultAt: new Date(T0),
      }))).returning({ id: rounds.id, number: rounds.number })
      await testDb.db.insert(roundPlaces).values(inserted.flatMap(({ id, number }) => {
        const first = number! % 2 === 1 ? 1 : 2
        return [{ roundId: id, team: first, place: 1 }, { roundId: id, team: 3 - first, place: 2 }]
      }))
    }

    it('refuses the last game with game_count_range and writes nothing, and the Host can still finish the Tie', async () => {
      const game = await running({ gameCount: GAME_COUNT_MAX })
      await seedAlternating(game, GAME_COUNT_MAX)
      expect((await read(game)).end).toMatchObject({ played: GAME_COUNT_MAX, gameCount: GAME_COUNT_MAX, complete: true, tie: [1, 2], lastGame: { rejection: 'game_count_range' } })
      const before = await eventRowOf(game.eventId)
      const activityBefore = await activityTypes(game.eventId)

      expect(await errorOf(await addLastGame(game))).toEqual({ status: 400, code: 'game_count_range' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(await activityTypes(game.eventId)).toEqual(activityBefore)
      expect(await (await finish(game, { outcome: 'tie', winners: [1, 2] })).json()).toEqual({ phase: 'finished', winners: [1, 2] })
    })
  })
})
