import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import castVeto from '../../server/api/e/[slug]/draws/[drawId]/veto.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import putResult from '../../server/api/e/[slug]/rounds/[id]/result.put'
import putBack from '../../server/api/e/[slug]/rounds/[id].delete'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import spinWheel from '../../server/api/e/[slug]/rounds/spin.post'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import { activity, draws, eventMembers, eventPoolGames, events, games, pollSlots, roundPlaces, rounds, users, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { readEventRows } from '../../server/utils/event-read'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityPage } from '../../shared/activity'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { VETO_WINDOW_MS } from '../../shared/rounds'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Entering a Result on an open Round (#273, spec #272): `PUT /api/e/:slug/rounds/:id/result` through the HTTP API with the in-memory
// room. What it stores, the number it gives, what the Event read shows afterwards, every refusal with its code and what it leaves
// behind, the feed entry, and two Results at once. Secrecy under a Hidden wheel is in hidden-wheel.test.ts and pool-preview.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
} as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'

describe('Results', () => {
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
      'POST /api/e/:slug/rounds': setGame,
      'POST /api/e/:slug/rounds/spin': spinWheel,
      'PUT /api/e/:slug/rounds/:id/result': putResult,
      'DELETE /api/e/:slug/rounds/:id': putBack,
      'POST /api/e/:slug/draws/:drawId/veto': castVeto,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await testDb.db.delete(vetoes)
    await testDb.db.delete(draws)
    await testDb.db.delete(rounds)
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

  async function errorOf(response: Response) {
    return { status: response.status, code: (await response.json() as { statusMessage: string }).statusMessage }
  }

  /**
   * A Running Session of an Event with `teams` Parties (2: two Players in each of teams 1 and 2; 3: one Player in each of teams 1 to 3)
   * and three games: Halo and Kart in the Game pool, Schach only in the library. With `wheel` the Selection mode is the Lucky Wheel with
   * a Veto allowance of `vetoAllowance` per Party. Every Round is set by the Host through the API.
   */
  async function running({ teams = 2, gameCount = 10, wheel = false, vetoAllowance = 0 }: { teams?: 2 | 3, gameCount?: number, wheel?: boolean, vetoAllowance?: number } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies: Partial<Record<keyof typeof players, string>> = {}
    for (const [key, profile] of Object.entries(players)) cookies[key as keyof typeof players] = (await signIn(testDb.db, profile)).cookie
    const pointsTable = { preset: 'linear' as const, values: teams === 2 ? [1, 0] : [2, 1, 0] }
    const settings = { ...TEST_SETTINGS, teamCount: teams, teamSize: teams === 2 ? 2 : 1, gameCount, pointsTable, ...(wheel ? { selectionMode: 'lucky_wheel' as const, vetoAllowance } : {}) }
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS, settings })
    const { slug } = await created.json() as { slug: string }
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
    for (const slotId of slotIds) expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId })).status).toBe(200)
    for (const [key, position] of seated) {
      const to: Place = { zone: 'team', team: position }
      expect((await send('POST', `/api/e/${slug}/move`, cookies[key], { userId: ids[key], to })).status).toBe(200)
    }
    expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
    await testDb.db.delete(activity)
    notifier.clear()
    return { slug, eventId, hostCookie, cookies, ids, halo, kart, schach }
  }

  type Game = Awaited<ReturnType<typeof running>>

  const read = async (game: Game, cookie = game.hostCookie) => await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView
  const set = (game: Game, gameId: string, vetoAllowed?: boolean) => send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, vetoAllowed === undefined ? { gameId } : { gameId, vetoAllowed })
  const enter = (game: Game, roundId: string, body: unknown, cookie = game.hostCookie) => send('PUT', `/api/e/${game.slug}/rounds/${roundId}/result`, cookie, body)
  const roundRows = (game: Game) => testDb.db.select().from(rounds).where(eq(rounds.eventId, game.eventId)).orderBy(rounds.startedAt, rounds.id)
  const placesOf = (roundId: string) => testDb.db.select().from(roundPlaces).where(eq(roundPlaces.roundId, roundId)).orderBy(roundPlaces.team)
  const feedOf = async (game: Game, cookie = game.hostCookie) => (await (await send('GET', `/api/e/${game.slug}/activity`, cookie)).json() as ActivityPage).entries

  /** Two Parties' Places and the Scores of a Result for two Parties: Party 1 wins, Party 2 is second. */
  const twoParties = [{ team: 1, place: 1, score: ' 16 ' }, { team: 2, place: 2, score: '' }]

  describe('entering a Result', () => {
    it('answers the number of the Round, stores it with the server clock, and one row per Party with its Place and Score', async () => {
      const game = await running()
      const roundId = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId

      const response = await enter(game, roundId, { places: twoParties })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ roundId, number: 1 })
      expect(await roundRows(game)).toMatchObject([{ id: roundId, number: 1, resultAt: new Date(T0), correctedAt: null }])
      expect(await placesOf(roundId)).toEqual([
        { roundId, team: 1, place: 1, score: '16' },
        { roundId, team: 2, place: 2, score: null },
      ])
    })

    it('takes the Round off the open Rounds for the Host and a Player, and leaves the other open Rounds', async () => {
      const game = await running()
      const kart = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      const halo = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId

      expect((await enter(game, halo, { places: twoParties })).status).toBe(200)

      expect((await read(game)).rounds.map(round => round.id)).toEqual([kart])
      expect((await read(game, game.cookies.three)).rounds.map(round => round.id)).toEqual([kart])
    })

    it('numbers the Results by the order they are entered, not by the order the Rounds started', async () => {
      const game = await running({ gameCount: 3 })
      const a = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      const b = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      const c = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId

      expect(await (await enter(game, c, { places: twoParties })).json()).toEqual({ roundId: c, number: 1 })
      expect(await (await enter(game, a, { places: twoParties })).json()).toEqual({ roundId: a, number: 2 })
      expect(await (await enter(game, b, { places: twoParties })).json()).toEqual({ roundId: b, number: 3 })
    })

    it('stores a Shared place as sent, and the entry names both Parties on Place 1', async () => {
      const game = await running({ teams: 3 })
      const roundId = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId

      const response = await enter(game, roundId, { places: [{ team: 3, place: 3 }, { team: 2, place: 1 }, { team: 1, place: 1, score: '1234567' }] })

      expect(response.status).toBe(200)
      expect((await placesOf(roundId)).map(row => [row.team, row.place])).toEqual([[1, 1], [2, 1], [3, 3]])
      expect((await feedOf(game))[0]).toMatchObject({ type: 'result_entered', params: { first: [1, 2] } })
    })

    it('gives every Party Place 1 when all are level, and keeps a Score of exactly 7 characters', async () => {
      const game = await running()
      const roundId = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId

      expect((await enter(game, roundId, { places: [{ team: 1, place: 1, score: '1234567' }, { team: 2, place: 1 }] })).status).toBe(200)

      expect(await placesOf(roundId)).toMatchObject([{ team: 1, place: 1, score: '1234567' }, { team: 2, place: 1, score: null }])
      expect((await feedOf(game))[0]).toMatchObject({ type: 'result_entered', params: { first: [1, 2] } })
    })

    it('takes a Result while no Session runs, and the other open Rounds stay on the read between Sessions', async () => {
      const game = await running()
      const kart = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      const halo = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)

      expect((await enter(game, halo, { places: twoParties })).status).toBe(200)

      const view = await read(game, game.cookies.three)
      expect(view.rounds.map(round => round.id)).toEqual([kart])
    })

    it('takes the Result of a Round that was set in Session 1, once Session 2 runs', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      expect((await send('POST', `/api/e/${game.slug}/sessions/start`, game.hostCookie)).status).toBe(200)

      expect((await enter(game, round, { places: twoParties })).status).toBe(200)
      expect(await roundRows(game)).toMatchObject([{ id: round, number: 1 }])
    })

    it('settles a Round whose Veto window ended unread in the same request, and refuses one whose window still runs', async () => {
      const game = await running({ wheel: true, vetoAllowance: 1 })
      const windowed = (await (await set(game, game.halo.id, true)).json() as { roundId: string }).roundId

      expect(await errorOf(await enter(game, windowed, { places: twoParties }))).toEqual({ status: 409, code: 'round_not_open' })

      clock.advance(VETO_WINDOW_MS)
      expect((await enter(game, windowed, { places: twoParties })).status).toBe(200)
      expect((await roundRows(game)).find(round => round.id === windowed)).toMatchObject({ gameId: game.halo.id, number: 1 })
    })

    it('refuses a Round being drawn: a spin before its stop is round_not_open', async () => {
      const game = await running({ wheel: true })
      const spun = await (await send('POST', `/api/e/${game.slug}/rounds/spin`, game.hostCookie)).json() as { roundId: string }

      expect(await errorOf(await enter(game, spun.roundId, { places: twoParties }))).toEqual({ status: 409, code: 'round_not_open' })
      expect(await roundRows(game)).toMatchObject([{ id: spun.roundId, number: null, resultAt: null }])
    })

    it('puts the Round of a Result into the feed for the Host and a Player, with the set game, and tells the room', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      notifier.clear()

      await enter(game, round, { places: twoParties })

      const page = (await feedOf(game, game.cookies.three)).filter(entry => entry.type === 'result_entered')
      expect(page).toMatchObject([{ type: 'result_entered', actor: { name: 'Hostess' }, params: { roundId: round, number: 1, gameId: game.halo.id, first: [1] }, games: { [game.halo.id]: 'Halo' } }])
      expect(notifier.messages(game.eventId).map(message => message.type)).toEqual(['event.changed', 'activity.added'])
    })

    it('names a library game in the entry as well as a pool game', async () => {
      const game = await running()
      const round = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId

      await enter(game, round, { places: twoParties })

      expect((await feedOf(game))[0]).toMatchObject({ type: 'result_entered', params: { gameId: game.schach.id }, games: { [game.schach.id]: 'Schach' } })
    })

    it('writes two entries in entry order when two Results are entered', async () => {
      const game = await running()
      const a = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      const b = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      await enter(game, a, { places: twoParties })
      await enter(game, b, { places: twoParties })

      const entries = (await feedOf(game)).filter(entry => entry.type === 'result_entered')

      expect(entries.map(entry => entry.type === 'result_entered' ? entry.params.number : null)).toEqual([2, 1])
    })

    it('gives two Rounds sent at once the numbers 1 and 2, and sends the same Round twice to one 200 and one 409', async () => {
      const game = await running()
      const a = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      const b = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId

      // Which of two requests sent at once is entered first depends on their arrival order, so the test compares the set of numbers.
      const both = await Promise.all([enter(game, a, { places: twoParties }), enter(game, b, { places: twoParties })])
      const answers = await Promise.all(both.map(response => response.json() as Promise<{ roundId: string, number: number }>))
      expect(answers.map(answer => answer.roundId).sort()).toEqual([a, b].sort())
      expect(answers.map(answer => answer.number).sort()).toEqual([1, 2])

      const c = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId
      const [first, second] = await Promise.all([enter(game, c, { places: twoParties }), enter(game, c, { places: twoParties })])
      expect([first.status, second.status].sort()).toEqual([200, 409])
      expect((await roundRows(game)).find(round => round.id === c)).toMatchObject({ number: 3 })
    })
  })

  describe('refusals', () => {
    it('answers not_host 403 to a Player, also with an invalid body and an unknown Round', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId

      expect(await errorOf(await enter(game, round, { places: twoParties }, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await errorOf(await enter(game, round, 'nope', game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await errorOf(await enter(game, 'nope', {}, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await roundRows(game)).toMatchObject([{ number: null, resultAt: null }])
    })

    it('answers not_set_up 409 for an Event whose settings are missing', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      await testDb.db.update(events).set({ teamCount: null }).where(eq(events.id, game.eventId))

      expect(await errorOf(await enter(game, round, { places: twoParties }))).toEqual({ status: 409, code: 'not_set_up' })
    })

    it('answers wrong_phase 409 once the Event is no longer running', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      await testDb.db.update(events).set({ phase: 'finished' }).where(eq(events.id, game.eventId))

      expect(await errorOf(await enter(game, round, { places: twoParties }))).toEqual({ status: 409, code: 'wrong_phase' })
    })

    it('answers round_not_found 404 for an unknown id, a malformed id, and a Round of another Event', async () => {
      const game = await running()
      const other = await running()
      const foreign = (await (await set(other, other.halo.id)).json() as { roundId: string }).roundId

      expect(await errorOf(await enter(game, '00000000-0000-4000-8000-00000000ffff', { places: twoParties }))).toEqual({ status: 404, code: 'round_not_found' })
      expect(await errorOf(await enter(game, 'nope', { places: twoParties }))).toEqual({ status: 404, code: 'round_not_found' })
      expect(await errorOf(await enter(game, foreign, { places: twoParties }))).toEqual({ status: 404, code: 'round_not_found' })
    })

    it('answers round_not_open 409 for a Round with a Result, a put-back Round and a Round waiting for a respin, and keeps the first Result', async () => {
      const game = await running({ wheel: true, vetoAllowance: 1 })
      // The Round with a Result comes first: a Round waiting for a respin takes the next set.
      const done = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId
      expect((await enter(game, done, { places: twoParties })).status).toBe(200)
      expect(await errorOf(await enter(game, done, { places: [{ team: 1, place: 2 }, { team: 2, place: 1 }] }))).toEqual({ status: 409, code: 'round_not_open' })
      expect(await placesOf(done)).toMatchObject([{ team: 1, place: 1, score: '16' }, { team: 2, place: 2, score: null }])
      expect((await roundRows(game)).find(round => round.id === done)).toMatchObject({ number: 1 })

      const put = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      expect((await send('DELETE', `/api/e/${game.slug}/rounds/${put}`, game.hostCookie)).status).toBe(200)
      expect(await errorOf(await enter(game, put, { places: twoParties }))).toEqual({ status: 409, code: 'round_not_open' })

      const vetoed = (await (await set(game, game.halo.id, true)).json() as { roundId: string }).roundId
      const [draw] = await testDb.db.select().from(draws).where(eq(draws.roundId, vetoed))
      expect((await send('POST', `/api/e/${game.slug}/draws/${draw!.id}/veto`, game.cookies.one)).status).toBe(200)
      clock.advance(VETO_WINDOW_MS)
      expect(await errorOf(await enter(game, vetoed, { places: twoParties }))).toEqual({ status: 409, code: 'round_not_open' })
    })

    it('answers invalid_result 400 for every body that is no Result of the Event, and round_not_found before it on an unknown Round', async () => {
      const game = await running({ teams: 3 })
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      const bad: unknown[] = [
        'nope',
        null,
        [],
        {},
        { places: 'x' },
        { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] },
        { places: [{ team: 1, place: 1 }, { team: 1, place: 2 }, { team: 3, place: 3 }] },
        { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 4, place: 3 }] },
        { places: [{ team: 0, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 3 }] },
        { places: [{ team: 1, place: 1 }, { team: 2, place: 1 }, { team: 3, place: 2 }] },
        { places: [{ team: 1, place: 0 }, { team: 2, place: 2 }, { team: 3, place: 3 }] },
        { places: [{ team: 1, place: 1.5 }, { team: 2, place: 2 }, { team: 3, place: 3 }] },
        { places: [{ team: 1, place: 1, score: '12345678' }, { team: 2, place: 2 }, { team: 3, place: 3 }] },
        { places: [{ team: 1, place: 1, score: 16 }, { team: 2, place: 2 }, { team: 3, place: 3 }] },
        { places: [{ team: 1, place: '1' }, { team: 2, place: 2 }, { team: 3, place: 3 }] },
      ]
      for (const body of bad) expect(await errorOf(await enter(game, round, body)), JSON.stringify(body)).toEqual({ status: 400, code: 'invalid_result' })

      expect(await errorOf(await enter(game, 'nope', bad[0]))).toEqual({ status: 404, code: 'round_not_found' })
      expect(await errorOf(await enter(game, round, { places: [{ team: 1, place: 1 }, { team: 1, place: 1 }] }))).toEqual({ status: 400, code: 'invalid_result' })
    })

    it('answers an invalid body on a Round that is not open with round_not_open, not invalid_result', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      await enter(game, round, { places: twoParties })

      expect(await errorOf(await enter(game, round, { places: 'x' }))).toEqual({ status: 409, code: 'round_not_open' })
    })

    it('writes nothing when it refuses: no number, no Places, no feed entry, no message', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      notifier.clear()
      const before = await feedOf(game)

      await enter(game, round, { places: [{ team: 1, place: 1 }] })
      await enter(game, round, { places: twoParties }, game.cookies.one)

      expect(await roundRows(game)).toMatchObject([{ number: null, resultAt: null }])
      expect(await placesOf(round)).toEqual([])
      expect(await feedOf(game)).toEqual(before)
      expect(notifier.messages(game.eventId)).toEqual([])
    })

    it('refuses to put a Round with a Result back, and the database refuses the same state', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      await enter(game, round, { places: twoParties })

      expect(await errorOf(await send('DELETE', `/api/e/${game.slug}/rounds/${round}`, game.hostCookie))).toEqual({ status: 409, code: 'round_not_open' })
      await expect(testDb.db.update(rounds).set({ putBackAt: new Date(T0) }).where(eq(rounds.id, round))).rejects.toThrow()
      expect(await roundRows(game)).toMatchObject([{ number: 1, putBackAt: null }])
    })
  })

  // The Event read after a Result (#274, spec #272): the three new fields every Member reads (`results`, `standings`, `end`), the
  // Standings rule and the gate of #258 on the results. The Hidden wheel and Pool preview cases are in their own files.
  describe('the Event read after a Result (#274)', () => {
    const readAll = async (game: Game, cookie?: string) => {
      const view = await read(game, cookie)
      return { results: view.results, standings: view.standings, end: view.end }
    }

    it('before any Result: no results, every Party at 0 points on rank 1 in team order, and the Game count', async () => {
      const game = await running()

      const host = await readAll(game)
      const player = await readAll(game, game.cookies.three)

      expect(host).toMatchObject({
        results: [],
        standings: [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }],
        end: { played: 0, gameCount: 10, complete: false, tie: null, finish: { rejection: 'results_missing' } },
      })
      expect(player).toMatchObject({ results: [], standings: host.standings, end: { played: 0, gameCount: 10, complete: false, tie: null, finish: null } })
    })

    it('after one Result for three Parties: the Round with its game, every Place, points and Score, the Standings and the count', async () => {
      const game = await running({ teams: 3 })
      await testDb.db.insert(eventMembers).values({ eventId: game.eventId, userId: game.ids.four })
      const roundId = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      expect((await enter(game, roundId, { places: [{ team: 1, place: 1, score: ' 16 ' }, { team: 2, place: 2 }, { team: 3, place: 3, score: '8' }] })).status).toBe(200)

      const expected = {
        results: [{
          roundId,
          number: 1,
          game: expect.objectContaining({ id: game.halo.id, name: 'Halo' }),
          places: [
            { team: 1, place: 1, points: 2, score: '16' },
            { team: 2, place: 2, points: 1, score: null },
            { team: 3, place: 3, points: 0, score: '8' },
          ],
          corrected: false,
          resultAt: new Date(T0).toISOString(),
        }],
        standings: [{ team: 1, rank: 1, points: 2 }, { team: 2, rank: 2, points: 1 }, { team: 3, rank: 3, points: 0 }],
        end: { played: 1, gameCount: 10 },
      }
      expect(await readAll(game)).toMatchObject(expected)
      expect(await readAll(game, game.cookies.two)).toMatchObject(expected)
      expect(await readAll(game, game.cookies.four)).toMatchObject(expected)
    })

    it('lists the Results by number, not by the order the Rounds started or were entered', async () => {
      const game = await running({ gameCount: 3 })
      const a = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      const b = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      const c = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId
      await enter(game, c, { places: twoParties })
      await enter(game, a, { places: twoParties })
      await enter(game, b, { places: twoParties })

      const view = await readAll(game)

      expect(view.results.map(result => [result.roundId, result.number])).toEqual([[c, 1], [a, 2], [b, 3]])
      expect(view.end).toMatchObject({ played: 3, gameCount: 3 })
    })

    it('ranks over several Results: a Shared place earns the better Place, equal totals share a rank, team order inside it', async () => {
      const game = await running({ teams: 3, gameCount: 3 })
      const a = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      const b = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      const c = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId

      // Result 1: teams 1 and 2 share Place 1 (2 points each), team 3 is third (0).
      await enter(game, a, { places: [{ team: 1, place: 1 }, { team: 2, place: 1 }, { team: 3, place: 3 }] })
      expect((await readAll(game)).results[0]!.places).toEqual([
        { team: 1, place: 1, points: 2, score: null },
        { team: 2, place: 1, points: 2, score: null },
        { team: 3, place: 3, points: 0, score: null },
      ])
      // Result 2: team 2 first (+2), team 1 second (+1): totals 3, 4, 0.
      await enter(game, b, { places: [{ team: 2, place: 1 }, { team: 1, place: 2 }, { team: 3, place: 3 }] })
      expect((await readAll(game)).standings).toEqual([{ team: 2, rank: 1, points: 4 }, { team: 1, rank: 2, points: 3 }, { team: 3, rank: 3, points: 0 }])
      // Result 3: team 3 first (+2), team 1 second (+1), team 2 third: totals 4, 4, 2.
      await enter(game, c, { places: [{ team: 3, place: 1 }, { team: 1, place: 2 }, { team: 2, place: 3 }] })

      const view = await readAll(game)
      expect(view.standings).toEqual([{ team: 1, rank: 1, points: 4 }, { team: 2, rank: 1, points: 4 }, { team: 3, rank: 3, points: 2 }])
      expect(view.end).toMatchObject({ played: 3, gameCount: 3 })
    })

    it('reads the same fields between Sessions, and a Round put back or still open is in no field', async () => {
      const game = await running()
      const done = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      await enter(game, done, { places: twoParties })
      await set(game, game.kart.id)
      const put = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId
      expect((await send('DELETE', `/api/e/${game.slug}/rounds/${put}`, game.hostCookie)).status).toBe(200)
      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)

      const host = await readAll(game)
      expect(host.results.map(result => result.roundId)).toEqual([done])
      expect(host.standings).toEqual([{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 2, points: 0 }])
      expect(host.end).toMatchObject({ played: 1, gameCount: 10 })
      expect(await readAll(game, game.cookies.one)).toEqual({ ...host, end: { ...host.end, finish: null } })
    })

    it('marks a Round corrected only when its corrected instant is set (the Correction itself is #275)', async () => {
      const game = await running({ gameCount: 3 })
      const a = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      const b = (await (await set(game, game.kart.id)).json() as { roundId: string }).roundId
      await enter(game, a, { places: twoParties })
      await enter(game, b, { places: twoParties })
      await testDb.db.update(rounds).set({ correctedAt: new Date(T0) }).where(eq(rounds.id, a))

      const view = await readAll(game)

      expect(view.results.map(result => [result.roundId, result.corrected])).toEqual([[a, true], [b, false]])
    })

    it('gives an Event that is not set up no results, no Standings and no end', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      await enter(game, round, { places: twoParties })
      await testDb.db.update(events).set({ teamCount: null }).where(eq(events.id, game.eventId))

      expect(await readAll(game)).toEqual({ results: [], standings: null, end: null })
      expect(await readAll(game, game.cookies.two)).toEqual({ results: [], standings: null, end: null })
    })

    it('lists a Round with a Result to the Host, and to a Player only when its game is known to them (#258), while the Standings count it', async () => {
      const game = await running()
      const round = (await (await set(game, game.halo.id)).json() as { roundId: string }).roundId
      await enter(game, round, { places: twoParties })
      // The set draw's stop moves into the future: the game is not known to a Player yet, the Host always knows it.
      await testDb.db.update(draws).set({ stopAt: new Date('2090-10-30T12:00:00.000Z') }).where(eq(draws.roundId, round))

      const host = await readAll(game)
      const player = await readAll(game, game.cookies.three)

      expect(host.results.map(result => result.roundId)).toEqual([round])
      expect(player.results).toEqual([])
      expect(player.standings).toEqual([{ team: 1, rank: 1, points: 1 }, { team: 2, rank: 2, points: 0 }])
      expect(player.end).toMatchObject({ played: 1, gameCount: 10 })
    })

    it('reads every draw with its Round in one statement, and the Rounds in start order with the put-back one', async () => {
      const game = await running({ wheel: true, vetoAllowance: 1 })
      const windowed = (await (await set(game, game.halo.id, true)).json() as { roundId: string }).roundId
      const [draw] = await testDb.db.select().from(draws).where(eq(draws.roundId, windowed))
      expect((await send('POST', `/api/e/${game.slug}/draws/${draw!.id}/veto`, game.cookies.one)).status).toBe(200)
      clock.advance(VETO_WINDOW_MS)
      await set(game, game.kart.id)
      const put = (await (await set(game, game.schach.id)).json() as { roundId: string }).roundId
      expect((await send('DELETE', `/api/e/${game.slug}/rounds/${put}`, game.hostCookie)).status).toBe(200)
      const [eventRow] = await testDb.db.select().from(events).where(eq(events.id, game.eventId))

      const rows = await readEventRows(testDb.db, eventRow!)

      expect(rows.rounds.map(entry => entry.round.id)).toEqual([windowed, put])
      expect(rows.draws).toHaveLength(3)
      expect(rows.draws.filter(row => row.roundId === windowed)).toHaveLength(2)
      const roundIds = new Set(rows.rounds.map(entry => entry.round.id))
      expect(rows.draws.every(row => roundIds.has(row.roundId))).toBe(true)
    })
  })
})
