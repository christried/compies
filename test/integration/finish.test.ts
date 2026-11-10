import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity, countdowns, events, sessions } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, resetDatabase } from './harness'
import { readEvent, readFeed, startRunningEvent, type Stage } from './scenario'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Finishing the Event (#277, spec #272): `POST /api/e/:slug/finish` through the HTTP API with the in-memory room. What the finish stores
// (the Phase, the end instant, the Sessions it ends and withdraws), the end the Event read shows, every refusal with its code and what it
// leaves behind, the feed entry, two finishes at once, and joining through the Invite link afterwards. The helper that seats an Event and
// starts its first Session is the one of results.test.ts, copied here (that file belongs to #275's edits).

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
  five: { provider: 'twitch', id: '6', name: 'Fünf', email: 'five@example.com', image: undefined },
} as const
const newcomer = { provider: 'twitch', id: '7', name: 'Neu', email: 'neu@example.com', image: undefined } as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00', '2090-11-01T19:00']
const T0 = '2090-10-30T10:00:00.000Z'

describe('Finishing the Event', () => {
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

  /**
   * A running Event: `teams` Parties (2: two Players in each of teams 1 and 2; 3: one Player in each of teams 1 to 3), `sessions` Sessions,
   * of which the first `confirmed` Slots have a Date. The first Session is started. Games: Halo and Kart in the Game pool, Schach in the library.
   */
  async function running({ teams = 2, gameCount = 2, sessions: sessionCount = 2, confirmed = sessionCount }: { teams?: 2 | 3, gameCount?: number, sessions?: number, confirmed?: number } = {}) {
    const seats = teams === 2
      ? [['one', 1], ['two', 1], ['three', 2], ['four', 2]] as const
      : [['one', 1], ['two', 2], ['three', 3]] as const
    const seatedKeys = seats.map(([key]) => key)
    const members = Object.fromEntries(seatedKeys.map(key => [key, players[key]])) as Record<typeof seatedKeys[number], typeof players[keyof typeof players]>
    // Signed in, no Member: the Players the Event has no seat for.
    const bystanders = Object.fromEntries(Object.entries(players).filter(([key]) => !(seatedKeys as string[]).includes(key)))
    const ev = await startRunningEvent(stage, {
      host,
      players: members,
      outsiders: bystanders,
      seats,
      sessions: sessionCount,
      slots: SLOTS.slice(0, sessionCount),
      confirmed,
      settings: { teamCount: teams, teamSize: teams === 2 ? 2 : 1, gameCount, pointsTable: { preset: 'linear' as const, values: teams === 2 ? [1, 0] : [2, 1, 0] } },
      games: [
        { key: 'halo', values: { name: 'Halo' }, pool: true },
        { key: 'kart', values: { name: 'Kart' }, pool: true },
        { key: 'schach', values: { name: 'Schach' }, pool: false },
      ],
      quiet: 'room-and-feed',
    })
    const everyone: Record<string, { cookie: string, id: string }> = { ...ev.players, ...ev.outsiders }
    const cookies: Partial<Record<keyof typeof players, string>> = Object.fromEntries(Object.entries(everyone).map(([key, signed]) => [key, signed.cookie]))
    const ids = { host: ev.host.id, ...Object.fromEntries(Object.entries(everyone).map(([key, signed]) => [key, signed.id])) } as Record<'host' | keyof typeof players, string>
    return { slug: ev.slug, eventId: ev.eventId, hostCookie: ev.host.cookie, cookies, ids, halo: ev.games.halo, kart: ev.games.kart, schach: ev.games.schach, inviteToken: ev.inviteToken }
  }

  type Game = Awaited<ReturnType<typeof running>>

  const read = (game: Game, cookie = game.hostCookie) => readEvent(stage, cookie, game.slug)
  const set = (game: Game, gameId: string) => send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, { gameId })
  const setRound = async (game: Game, gameId: string) => (await (await set(game, gameId)).json() as { roundId: string }).roundId
  const enter = (game: Game, roundId: string, body: unknown, cookie = game.hostCookie) => send('PUT', `/api/e/${game.slug}/rounds/${roundId}/result`, cookie, body)
  const finish = (game: Game, body: unknown = { outcome: 'winner', winners: [1] }, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/finish`, cookie, body)
  const eventRowOf = async (eventId: string) => (await testDb.db.select().from(events).where(eq(events.id, eventId)))[0]!
  const sessionRows = (eventId: string) => testDb.db.select().from(sessions).where(eq(sessions.eventId, eventId)).orderBy(sessions.startsAt)
  const activityTypes = async (eventId: string) => (await testDb.db.select({ type: activity.type }).from(activity).where(eq(activity.eventId, eventId))).map(row => row.type).sort()
  const types = (eventId: string) => notifier.messages(eventId).map(message => message.type)
  const feedOf = (game: Game, cookie = game.hostCookie) => readFeed(stage, cookie, game.slug)

  /** Party 1 wins the Result: one for team 1 first, team 2 second. */
  const teamOneWins = [{ team: 1, place: 1 }, { team: 2, place: 2 }]
  /** Party 2 wins it. */
  const teamTwoWins = [{ team: 2, place: 1 }, { team: 1, place: 2 }]

  describe('the finish and what it leaves behind', () => {
    it('finishes with a Running Session: the Event is finished, the Session ended, the Countdown gone, and the read shows the end', async () => {
      const game = await running()
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      expect((await setCountdownFor(game, 60)).status).toBe(200)

      const response = await finish(game)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ phase: 'finished', winners: [1] })
      const event = await eventRowOf(game.eventId)
      expect(event).toMatchObject({ phase: 'finished', finishedAt: new Date(T0) })
      expect((await sessionRows(game.eventId)).find(row => row.startedAt !== null)).toMatchObject({ endedAt: new Date(T0) })
      expect(await testDb.db.select().from(countdowns)).toEqual([])
      const view = await read(game)
      expect(view.event.phase).toBe('finished')
      expect(view.runningSessionId).toBeNull()
      expect(view.end).toMatchObject({ played: 2, gameCount: 2, complete: true, tie: null, finish: { rejection: 'wrong_phase' } })
      expect((await read(game, game.cookies.three)).end).toMatchObject({ played: 2, gameCount: 2, complete: true, tie: null, finish: null })
    })

    it('finishes without a Running Session (Results entered between Sessions) and leaves the ended Session as it was', async () => {
      const game = await running()
      const round = await setRound(game, game.halo.id)
      const kart = await setRound(game, game.kart.id)
      clock.advance(3_600_000)
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, kart, { places: teamOneWins })).status).toBe(200)
      clock.advance(3_600_000)

      expect((await finish(game)).status).toBe(200)

      const ended = (await sessionRows(game.eventId)).find(row => row.startedAt !== null)
      expect(ended).toMatchObject({ endedAt: new Date(Date.parse(T0) + 3_600_000) })
    })

    it('withdraws the Sessions that have not started: a dated one stays as a removed row with its notice, an undated one is gone', async () => {
      const game = await running({ sessions: 3, confirmed: 2, gameCount: 2 })
      const before = await sessionRows(game.eventId)
      const dated = before.find(row => row.startedAt === null && row.startsAt !== null)!
      const undated = before.find(row => row.startsAt === null)!
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)

      expect((await finish(game)).status).toBe(200)

      const after = await sessionRows(game.eventId)
      expect(after.find(row => row.id === undated.id)).toBeUndefined()
      expect(after.find(row => row.id === dated.id)).toMatchObject({ removedAt: new Date(T0), previousStartsAt: dated.startsAt, startsAt: null, slotId: null })
      const view = await read(game)
      expect(view.sessions.map(row => row.id)).toEqual([before.find(row => row.startedAt !== null)!.id])
      expect(view.removedSessions).toEqual([{ id: dated.id, previousStartsAt: dated.startsAt!.toISOString() }])
      expect(view.missingDates).toBe(0)
    })

    it('raises the calendar sequence of the Session whose number changes (two Sessions to one), and not of a removed one', async () => {
      const game = await running({ sessions: 2, confirmed: 2, gameCount: 1 })
      const before = await sessionRows(game.eventId)
      const started = before.find(row => row.startedAt !== null)!
      const dated = before.find(row => row.startedAt === null)!
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)

      expect((await finish(game)).status).toBe(200)

      const after = await sessionRows(game.eventId)
      expect(after.find(row => row.id === started.id)).toMatchObject({ icsSequence: started.icsSequence + 1 })
      expect(after.find(row => row.id === dated.id)).toMatchObject({ icsSequence: dated.icsSequence, removedAt: new Date(T0) })
    })

    it('finishes as Unentschieden: both Parties of the Tie win, the Session ends, one feed entry, and the read shows the Tie', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)
      const activityBefore = await activityTypes(game.eventId)

      const response = await finish(game, { outcome: 'tie', winners: [1, 2] })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ phase: 'finished', winners: [1, 2] })
      expect(await eventRowOf(game.eventId)).toMatchObject({ phase: 'finished', finishedAt: new Date(T0) })
      expect((await sessionRows(game.eventId)).find(row => row.startedAt !== null)).toMatchObject({ endedAt: new Date(T0) })
      expect(await activityTypes(game.eventId)).toEqual([...activityBefore, 'event_finished'].sort())
      expect((await feedOf(game))[0]).toMatchObject({ type: 'event_finished', params: { winners: [1, 2] } })
      expect((await read(game)).end).toMatchObject({ played: 2, gameCount: 2, complete: true, tie: [1, 2], finish: { rejection: 'wrong_phase' } })
    })

    it('finishes as Unentschieden with three Parties level: all three win and rank 1 in the Standings', async () => {
      const game = await running({ teams: 3, gameCount: 3 })
      const games = [game.halo.id, game.kart.id, game.schach.id]
      const levelled = [
        [{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 3 }],
        [{ team: 2, place: 1 }, { team: 3, place: 2 }, { team: 1, place: 3 }],
        [{ team: 3, place: 1 }, { team: 1, place: 2 }, { team: 2, place: 3 }],
      ]
      for (const [index, places] of levelled.entries()) {
        const roundId = await setRound(game, games[index]!)
        expect((await enter(game, roundId, { places })).status).toBe(200)
      }
      expect((await read(game)).end).toMatchObject({ complete: true, tie: [1, 2, 3] })

      expect(await (await finish(game, { outcome: 'tie', winners: [1, 2, 3] })).json()).toEqual({ phase: 'finished', winners: [1, 2, 3] })
      expect((await read(game)).standings).toEqual([
        { team: 1, rank: 1, points: 3 },
        { team: 2, rank: 1, points: 3 },
        { team: 3, rank: 1, points: 3 },
      ])
    })

    it('ends the Event with the one winner of three Parties and reads its Standings', async () => {
      const game = await running({ teams: 3, gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: [{ team: 2, place: 1 }, { team: 1, place: 2 }, { team: 3, place: 3 }] })).status).toBe(200)
      expect((await enter(game, second, { places: [{ team: 2, place: 1 }, { team: 3, place: 2 }, { team: 1, place: 3 }] })).status).toBe(200)

      expect(await (await finish(game, { outcome: 'winner', winners: [2] })).json()).toEqual({ phase: 'finished', winners: [2] })
      expect((await read(game)).standings).toEqual([
        { team: 2, rank: 1, points: 4 },
        { team: 1, rank: 2, points: 1 },
        { team: 3, rank: 2, points: 1 },
      ])
    })
  })

  describe('the feed and the room', () => {
    it('writes exactly one entry, the finish, and announces it with event.changed and one activity.added', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      const beforeFinish = await activityTypes(game.eventId)
      notifier.clear()

      expect((await finish(game)).status).toBe(200)

      expect(await activityTypes(game.eventId)).toEqual([...beforeFinish, 'event_finished'].sort())
      expect(types(game.eventId)).toEqual(['event.changed', 'activity.added'])
      expect((await feedOf(game))[0]).toMatchObject({ type: 'event_finished', actor: { id: game.ids.host }, params: { winners: [1] } })
    })

    it('lets a Player read the finish entry', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      expect((await finish(game)).status).toBe(200)

      expect((await feedOf(game, game.cookies.three))[0]).toMatchObject({ type: 'event_finished', params: { winners: [1] } })
    })
  })

  describe('the feed on the clock of the Sessions', () => {
    // The Sessions' instants are the request's clock (#259) and the feed's groups compare an entry with them (groupActivity). The test
    // clock runs 64 years ahead of the database's, the far end of the skew s5 measured (1.7 s): an entry stamped by the database
    // would sit before the start of the Session it belongs to.
    it('stamps every entry at or after its request, so the start, the set game and the finish fall into the groups they belong to', async () => {
      const game = await running({ gameCount: 2, sessions: 2 })
      const first = await setRound(game, game.halo.id)
      clock.advance(60_000)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      clock.advance(3_600_000)
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      clock.advance(3_600_000)
      expect((await send('POST', `/api/e/${game.slug}/sessions/start`, game.hostCookie)).status).toBe(200)
      clock.advance(60_000)
      const second = await setRound(game, game.kart.id)
      clock.advance(60_000)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      clock.advance(60_000)
      expect((await finish(game)).status).toBe(200)

      const started = (await sessionRows(game.eventId)).filter(row => row.startedAt !== null).map(row => ({ from: row.startedAt!.getTime(), to: row.endedAt!.getTime() }))
      expect(started).toHaveLength(2)
      const entries = await feedOf(game)
      const times = (type: string) => entries.filter(entry => entry.type === type).map(entry => Date.parse(entry.at))
      expect(times('session_started')[0]).toBeGreaterThanOrEqual(started[1]!.from)
      expect(times('game_set')[0]).toBeGreaterThanOrEqual(started[1]!.from)
      expect(times('game_set')[0]).toBeLessThan(started[1]!.to)
      expect(times('event_finished')[0]).toBeGreaterThanOrEqual(started[1]!.to)
      expect(times('game_set')[1]).toBeLessThan(started[0]!.to)
      expect(entries.map(entry => entry.type)).toEqual(['event_finished', 'result_entered', 'game_set', 'session_started', 'session_ended', 'result_entered', 'game_set'])
    })

    // The other direction (#259, review 0.8 F7): dev's database clock leads the app's by about 1.7 s. An entry written less than that
    // before the end of a Session must not take a database instant after `endedAt`, or it lands under "Nach der Session". The test clock
    // here runs an hour behind the database's, so every entry of the test is inside the lead.
    it('stamps no entry after the end of its Session when the database clock leads the request clock', async () => {
      clock.set(new Date(Date.now() - 3_600_000))
      const game = await running({ gameCount: 2, sessions: 2 })
      clock.advance(60_000)
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      clock.advance(60_000)
      expect((await send('POST', `/api/e/${game.slug}/sessions/start`, game.hostCookie)).status).toBe(200)
      clock.advance(60_000)
      const round = await setRound(game, game.kart.id)
      clock.advance(60_000)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      clock.advance(60_000)
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)

      const second = (await sessionRows(game.eventId)).filter(row => row.startedAt !== null).map(row => ({ from: row.startedAt!.getTime(), to: row.endedAt!.getTime() }))[1]!
      const times = (await feedOf(game)).reduce<Record<string, number[]>>((byType, entry) => ({ ...byType, [entry.type]: [...(byType[entry.type] ?? []), Date.parse(entry.at)] }), {})
      expect(times.session_started![0]).toBeGreaterThanOrEqual(second.from)
      expect(times.game_set![0]).toBeGreaterThanOrEqual(second.from)
      expect(times.game_set![0]).toBeLessThan(second.to)
      expect(times.result_entered![0]).toBeLessThan(second.to)
      expect(times.session_ended![0]).toBeGreaterThanOrEqual(second.to)
    })

    it('keeps the order of two entries that one change writes', async () => {
      setAllowlist({ hosts: 'discord:1' })
      const { cookie } = await signIn(testDb.db, host)
      const created = await send('POST', '/api/e', cookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: SLOTS.slice(0, 1), settings: TEST_SETTINGS })
      const { slug } = await created.json() as { slug: string }

      expect((await send('PATCH', `/api/e/${slug}/settings`, cookie, { settings: { gameCount: TEST_SETTINGS.gameCount + 2, teamSize: TEST_SETTINGS.teamSize + 1 } })).status).toBe(200)

      const entries = await readFeed(stage, cookie, slug)
      expect(entries.map(entry => entry.type)).toEqual(['team_size_changed', 'game_count_changed'])
    })

    it('keeps the order of two changes made on a clock that stands still', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)

      expect((await feedOf(game)).map(entry => entry.type)).toEqual(['result_entered', 'result_entered', 'game_set', 'game_set'])
      expect((await feedOf(game)).map(entry => entry.params).slice(2)).toMatchObject([{ gameId: game.kart.id }, { gameId: game.halo.id }])
    })
  })

  describe('refusals, in order', () => {
    it('refuses a Player with not_host', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)

      expect(await errorOf(await finish(game, { outcome: 'winner', winners: [1] }, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
    })

    it('refuses the Host in a Event that is not running (the Date poll) with wrong_phase', async () => {
      setAllowlist({ hosts: 'discord:1' })
      const { cookie } = await signIn(testDb.db, host)
      const created = await send('POST', '/api/e', cookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: SLOTS.slice(0, 1), settings: { ...TEST_SETTINGS, gameCount: 1 } })
      const { slug } = await created.json() as { slug: string }

      expect(await errorOf(await send('POST', `/api/e/${slug}/finish`, cookie, { outcome: 'winner', winners: [1] }))).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it('refuses the Host in an Event that is not set up with wrong_phase (#288: the rule\'s order, after the settings are read)', async () => {
      const game = await running()
      await testDb.db.update(events).set({ teamCount: null }).where(eq(events.id, game.eventId))

      expect(await errorOf(await finish(game))).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it('refuses an Event whose Rounds with a Result fall short of the Game count with results_missing, and writes nothing', async () => {
      const game = await running({ gameCount: 2 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      const before = await eventRowOf(game.eventId)
      const sessionsBefore = await sessionRows(game.eventId)
      const activityBefore = await activityTypes(game.eventId)

      expect(await errorOf(await finish(game))).toEqual({ status: 409, code: 'results_missing' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(await sessionRows(game.eventId)).toEqual(sessionsBefore)
      expect(await activityTypes(game.eventId)).toEqual(activityBefore)
    })

    it('refuses a Tie while the count is incomplete with results_missing, and writes nothing', async () => {
      const game = await running({ gameCount: 2 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      const before = await eventRowOf(game.eventId)
      const activityBefore = await activityTypes(game.eventId)

      expect(await errorOf(await finish(game, { outcome: 'tie', winners: [1, 2] }))).toEqual({ status: 409, code: 'results_missing' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(await activityTypes(game.eventId)).toEqual(activityBefore)
    })

    it('refuses a Tie that the Standings do not have (one sole leader) with standings_changed, and writes nothing', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      const before = await eventRowOf(game.eventId)
      const activityBefore = await activityTypes(game.eventId)

      expect(await errorOf(await finish(game, { outcome: 'tie', winners: [1] }))).toEqual({ status: 409, code: 'standings_changed' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(await activityTypes(game.eventId)).toEqual(activityBefore)
    })

    it('answers invalid_value for a body without outcome or without winners, with an unknown outcome, or with winners that are no team positions', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)

      expect(await errorOf(await send('POST', `/api/e/${game.slug}/finish`, game.hostCookie, {}))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await finish(game, { outcome: 'draw', winners: [1] }))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await finish(game, { outcome: 7, winners: [1] }))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await finish(game, { outcome: 'winner' }))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await finish(game, { outcome: 'winner', winners: '1' }))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await finish(game, { outcome: 'winner', winners: ['1'] }))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await finish(game, { outcome: 'winner', winners: [1.5] }))).toEqual({ status: 400, code: 'invalid_value' })
      expect((await eventRowOf(game.eventId)).phase).toBe('running')
    })

    it('refuses a second finish with wrong_phase', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      expect((await finish(game)).status).toBe(200)

      expect(await errorOf(await finish(game))).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it('refuses the winner of a Tie with standings_changed, and writes nothing', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)
      const read0 = await read(game)
      expect(read0.end).toMatchObject({ complete: true, tie: [1, 2], finish: { rejection: null } })
      const before = await eventRowOf(game.eventId)
      const activityBefore = await activityTypes(game.eventId)

      expect(await errorOf(await finish(game, { outcome: 'winner', winners: [1] }))).toEqual({ status: 409, code: 'standings_changed' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(await activityTypes(game.eventId)).toEqual(activityBefore)
    })

    // Story 53: the Host never closes the Event on Standings he did not see. The outcome alone is not enough: a Correction can change who leads
    // and leave the outcome as it was (#277, review 0.8 S2), so the finish carries the Parties on Place 1 that the Host saw.
    it('refuses a sole winner the Host did not see: a Correction in another tab made Party 2 the leader, the outcome is still „winner“', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, first, { places: teamTwoWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ complete: true, tie: null })
      const before = await eventRowOf(game.eventId)
      const activityBefore = await activityTypes(game.eventId)

      expect(await errorOf(await finish(game, { outcome: 'winner', winners: [1] }))).toEqual({ status: 409, code: 'standings_changed' })

      expect(await eventRowOf(game.eventId)).toEqual(before)
      expect(await activityTypes(game.eventId)).toEqual(activityBefore)
      expect(await (await finish(game, { outcome: 'winner', winners: [2] })).json()).toEqual({ phase: 'finished', winners: [2] })
    })

    it('refuses a Tie whose Parties changed: Parties 1 and 2 on Place 1 became Parties 1 and 3', async () => {
      const game = await running({ teams: 3, gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 3 }] })).status).toBe(200)
      expect((await enter(game, second, { places: [{ team: 2, place: 1 }, { team: 1, place: 2 }, { team: 3, place: 3 }] })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ complete: true, tie: [1, 2] })
      expect((await enter(game, first, { places: [{ team: 1, place: 1 }, { team: 3, place: 2 }, { team: 2, place: 3 }] })).status).toBe(200)
      expect((await enter(game, second, { places: [{ team: 3, place: 1 }, { team: 1, place: 2 }, { team: 2, place: 3 }] })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ complete: true, tie: [1, 3] })
      const before = await eventRowOf(game.eventId)

      expect(await errorOf(await finish(game, { outcome: 'tie', winners: [1, 2] }))).toEqual({ status: 409, code: 'standings_changed' })
      expect(await eventRowOf(game.eventId)).toEqual(before)
    })

    it('takes the winners of a Tie in any order and as a set', async () => {
      const game = await running({ gameCount: 2 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamTwoWins })).status).toBe(200)

      expect(await (await finish(game, { outcome: 'tie', winners: [2, 1, 2] })).json()).toEqual({ phase: 'finished', winners: [1, 2] })
    })
  })

  describe('stopping early', () => {
    it('lowers the Game count to the Rounds with a Result and finishes; an open third Round keeps it from being lowered', async () => {
      const game = await running({ gameCount: 5 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ played: 2, gameCount: 5, complete: false })

      await setRound(game, game.schach.id)
      expect(await errorOf(await send('PATCH', `/api/e/${game.slug}/settings`, game.hostCookie, { settings: { gameCount: 2 } }))).toEqual({ status: 409, code: 'game_count_below_started' })
      expect(await errorOf(await finish(game))).toEqual({ status: 409, code: 'results_missing' })
    })

    it('finishes once the Game count is lowered to the Results', async () => {
      const game = await running({ gameCount: 5 })
      const first = await setRound(game, game.halo.id)
      const second = await setRound(game, game.kart.id)
      expect((await enter(game, first, { places: teamOneWins })).status).toBe(200)
      expect((await enter(game, second, { places: teamOneWins })).status).toBe(200)

      expect((await send('PATCH', `/api/e/${game.slug}/settings`, game.hostCookie, { settings: { gameCount: 2 } })).status).toBe(200)
      expect((await read(game)).end).toMatchObject({ played: 2, gameCount: 2, complete: true })
      expect((await finish(game)).status).toBe(200)
    })
  })

  describe('finishing at once and joining afterwards', () => {
    it('lets exactly one of two finishes at once through', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)

      const [a, b] = await Promise.all([finish(game), finish(game)])

      expect([a.status, b.status].sort()).toEqual([200, 409])
      const refused = a.status === 409 ? a : b
      expect((await refused.json() as { statusMessage: string }).statusMessage).toBe('wrong_phase')
      expect((await activityTypes(game.eventId)).filter(type => type === 'event_finished')).toHaveLength(1)
    })

    it('lets a new Member join through the Invite link of a finished Event, onto the Bench; the Host rotates the link and the old one is gone', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      expect((await finish(game)).status).toBe(200)
      const invite = game.inviteToken
      const { cookie } = await signIn(testDb.db, newcomer)

      expect(await (await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie } })).json()).toEqual({ slug: game.slug, joined: true })
      const view = await read(game, cookie)
      expect(view.members.find(member => member.id === view.viewerId)).toMatchObject({ zone: 'bench' })
      expect(view.event.phase).toBe('finished')

      const rotated = await request(`/api/e/${game.slug}/rotate`, { method: 'POST', headers: { cookie: game.hostCookie } })
      expect(rotated.status).toBe(200)
      const { cookie: other } = await signIn(testDb.db, { provider: 'twitch', id: '8', name: 'Anders', email: 'anders@example.com', image: undefined })
      expect(await errorOf(await request(`/api/invite/${invite}`, { method: 'POST', headers: { cookie: other } }))).toEqual({ status: 404, code: 'Event not found' })
    })
  })

  describe('the home list', () => {
    it('lists the finished Event with its Phase finished, within the 24 hours after its last Session', async () => {
      const game = await running({ gameCount: 1 })
      const round = await setRound(game, game.halo.id)
      expect((await enter(game, round, { places: teamOneWins })).status).toBe(200)
      expect((await finish(game)).status).toBe(200)

      const home = await (await send('GET', '/api/e', game.hostCookie)).json() as { events: { slug: string, phase: string }[] }
      expect(home.events.find(event => event.slug === game.slug)).toMatchObject({ phase: 'finished' })
    })
  })

  /** Sets the Countdown of the running Session (#236) to `seconds`. */
  function setCountdownFor(game: Game, seconds: number) {
    return send('PUT', `/api/e/${game.slug}/countdown`, game.hostCookie, { seconds })
  }
})
