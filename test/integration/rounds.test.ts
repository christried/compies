import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import putBack from '../../server/api/e/[slug]/rounds/[id].delete'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import changeSettings from '../../server/api/e/[slug]/settings.patch'
import endSession from '../../server/api/e/[slug]/sessions/end.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import { activity, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityPage } from '../../shared/activity'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// Setting the next game, several open Rounds and putting one back (#228, spec #218 § Rounds, „Nächstes Spiel setzen“): the
// Host's two endpoints through the HTTP API with the in-memory room, every refusal with its code, what the Event read shows
// each Member, the games left in the Game pool, and what survives the end of a Session. Secrecy under a Hidden wheel and
// without Pool preview is in hidden-wheel.test.ts and pool-preview.test.ts.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
} as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'

describe('Rounds', () => {
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
      'PATCH /api/e/:slug/settings': changeSettings,
      'POST /api/e/:slug/sessions/start': startSession,
      'POST /api/e/:slug/sessions/end': endSession,
      'POST /api/e/:slug/rounds': setGame,
      'DELETE /api/e/:slug/rounds/:id': putBack,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
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

  const team = (n: number): Place => ({ zone: 'team', team: n })

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
   * A Running Session of an Event with two teams of two (One and Two in team 1, Three and Four in team 2) and three games:
   * Halo and Kart in the Game pool, Schach only in the library. Every game has notes. The Game count is `gameCount`.
   */
  async function running({ gameCount = 10 }: { gameCount?: number } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies: Record<keyof typeof players, string> = {
      one: (await signIn(testDb.db, players.one)).cookie,
      two: (await signIn(testDb.db, players.two)).cookie,
      three: (await signIn(testDb.db, players.three)).cookie,
      four: (await signIn(testDb.db, players.four)).cookie,
    }
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS, settings: { ...TEST_SETTINGS, teamSize: 2, gameCount } })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const eventId = eventRow!.id
    const ids = {} as Record<'host' | keyof typeof players, string>
    for (const [key, profile] of Object.entries({ host, ...players })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key as keyof typeof ids] = row!.id
    }
    for (const key of Object.keys(players) as (keyof typeof players)[]) await testDb.db.insert(eventMembers).values({ eventId, userId: ids[key] })

    const inserted = await testDb.db.insert(games).values([
      { name: 'Halo', createdBy: ids.host, notes: 'Hausregel Halo', imageKey: 'halo-key', youtubeId: 'aaaaaaaaaaa', playersMin: 2, playersMax: 4 },
      { name: 'Kart', createdBy: ids.host, notes: 'Hausregel Kart' },
      { name: 'Schach', createdBy: ids.host, notes: 'Hausregel Schach', playersMin: 2, playersMax: 2 },
    ]).returning()
    const [halo, kart, schach] = inserted as [typeof inserted[number], typeof inserted[number], typeof inserted[number]]
    await testDb.db.insert(eventPoolGames).values([
      { eventId, gameId: halo.id, pool: 'main' },
      { eventId, gameId: kart.id, pool: 'main' },
    ])

    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
    for (const slotId of slotIds) expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId })).status).toBe(200)
    const seats = [['one', 1], ['two', 1], ['three', 2], ['four', 2]] as const
    for (const [key, position] of seats) expect((await send('POST', `/api/e/${slug}/move`, cookies[key], { userId: ids[key], to: team(position) })).status).toBe(200)
    expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
    await testDb.db.delete(activity)
    notifier.clear()
    return { slug, eventId, hostCookie, cookies, ids, halo, kart, schach }
  }

  type Game = Awaited<ReturnType<typeof running>>

  const read = async (game: Game, cookie = game.hostCookie) => await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView
  const set = (game: Game, gameId: string, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/rounds`, cookie, { gameId })
  const putBackRound = (game: Game, roundId: string, cookie = game.hostCookie) => send('DELETE', `/api/e/${game.slug}/rounds/${roundId}`, cookie)
  const roundRows = (game: Game) => testDb.db.select().from(rounds).where(eq(rounds.eventId, game.eventId)).orderBy(rounds.startedAt)
  const drawRows = () => testDb.db.select().from(draws)

  describe('setting the next game', () => {
    it('sets a game of the Game pool: a set Round with one set draw from the pool, stamped by the server clock', async () => {
      const game = await running()

      const response = await set(game, game.halo.id)

      expect(response.status).toBe(200)
      const [round] = await roundRows(game)
      expect(await response.json()).toEqual({ roundId: round!.id })
      expect(round).toMatchObject({ gameId: game.halo.id, startedAt: new Date(T0), setAt: new Date(T0), putBackAt: null })
      expect(await drawRows()).toMatchObject([{ roundId: round!.id, gameId: game.halo.id, source: 'pool', kind: 'set', committedAt: new Date(T0), stopAt: new Date(T0), vetoEndsAt: null, outcome: 'set', settledAt: new Date(T0) }])
    })

    it('sets a game that is not in the pool from the library: it comes from the library and never joins the pool', async () => {
      const game = await running()

      expect((await set(game, game.schach.id)).status).toBe(200)

      expect(await drawRows()).toMatchObject([{ gameId: game.schach.id, source: 'library' }])
      const view = await read(game)
      expect(view.setGame?.left.sort()).toEqual([game.halo.id, game.kart.id].sort())
      expect((view.pools?.main ?? []).map(poolGame => poolGame.name)).toEqual(['Halo', 'Kart'])
    })

    it('takes a pool game out of the games left, and not twice: set again, it comes from the library', async () => {
      const game = await running()
      expect((await read(game)).setGame?.left.sort()).toEqual([game.halo.id, game.kart.id].sort())

      await set(game, game.halo.id)
      expect((await read(game)).setGame?.left).toEqual([game.kart.id])

      await set(game, game.halo.id)
      expect((await drawRows()).map(draw => draw.source)).toEqual(['pool', 'library'])
      expect((await read(game)).setGame?.left).toEqual([game.kart.id])
    })

    it('lets several Rounds be open at the same time, listed in the order they started', async () => {
      const game = await running()

      await set(game, game.kart.id)
      clock.advance(60_000)
      await set(game, game.halo.id)

      const view = await read(game)
      expect(view.rounds.map(round => round.game.name)).toEqual(['Kart', 'Halo'])
      expect(view.rounds.map(round => round.startedAt)).toEqual(['2090-10-30T10:00:00.000Z', '2090-10-30T10:01:00.000Z'])
    })

    it('shows every Member the open Round with its game\'s name, image, player count and clip, and the Host its Game notes only', async () => {
      const game = await running()
      await set(game, game.halo.id)

      const asHost = await read(game)
      const asPlayer = await read(game, game.cookies.three)

      expect(asHost.rounds).toMatchObject([{ game: { id: game.halo.id, name: 'Halo', imageUrl: '/api/images/halo-key', youtubeId: 'aaaaaaaaaaa', playersMin: 2, playersMax: 4 }, notes: 'Hausregel Halo' }])
      expect(asPlayer.rounds).toMatchObject([{ game: { id: game.halo.id, name: 'Halo', imageUrl: '/api/images/halo-key', playersMin: 2, playersMax: 4 } }])
      expect(asPlayer.rounds[0]).not.toHaveProperty('notes')
      expect(asPlayer.rounds[0]!.game).not.toHaveProperty('notes')
    })

    it('says in the Event read, for the Host only, whether a game can be set now', async () => {
      const game = await running()

      expect((await read(game)).setGame).toEqual({ rejection: null, left: expect.any(Array) })
      expect((await read(game, game.cookies.one)).setGame).toBeNull()
    })

    it('writes the feed entry „game set“ with the game\'s name for everyone, and tells the room without any game data', async () => {
      const game = await running()

      await set(game, game.halo.id)

      const [round] = await roundRows(game)
      const page = await (await send('GET', `/api/e/${game.slug}/activity`, game.cookies.three)).json() as ActivityPage
      expect(page.entries).toMatchObject([{ type: 'game_set', actor: { name: 'Hostess' }, params: { roundId: round!.id, gameId: game.halo.id }, games: { [game.halo.id]: 'Halo' } }])
      const messages = notifier.messages(game.eventId)
      expect(messages.map(message => message.type)).toEqual(['event.changed', 'activity.added', 'round.set'])
      expect(messages.find(message => message.type === 'round.set')).toEqual({ type: 'round.set', roundId: round!.id, v: 1, serverTime: new Date(T0).getTime() })
    })

    it('answers only the Host: a Member gets 403 not_host and nothing is written', async () => {
      const game = await running()

      expect(await errorOf(await set(game, game.halo.id, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })

      expect(await roundRows(game)).toEqual([])
      expect(notifier.messages(game.eventId)).toEqual([])
    })

    it('answers 401 to a signed-out request and 400 invalid_value to a body without a game id', async () => {
      const game = await running()

      expect((await send('POST', `/api/e/${game.slug}/rounds`, undefined, { gameId: game.halo.id })).status).toBe(401)
      expect(await errorOf(await send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, {}))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, { gameId: 'halo' }))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await errorOf(await send('POST', `/api/e/${game.slug}/rounds`, game.hostCookie, { gameId: [game.halo.id] }))).toEqual({ status: 400, code: 'invalid_value' })
    })

    it('answers 400 unknown_game for a game the library does not have', async () => {
      const game = await running()

      expect(await errorOf(await set(game, '00000000-0000-4000-8000-000000000999'))).toEqual({ status: 400, code: 'unknown_game' })
      expect(await roundRows(game)).toEqual([])
    })
  })

  describe('the refusals', () => {
    it('refuses without a running Session with 409 no_running_session: before the start and after the end', async () => {
      const game = await running()
      await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)

      expect(await errorOf(await set(game, game.halo.id))).toEqual({ status: 409, code: 'no_running_session' })
      expect((await read(game)).setGame?.rejection).toBe('no_running_session')
    })

    it('refuses uneven teams with 409 teams_uneven, and the Event read says so', async () => {
      const game = await running()
      await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids.four, to: { zone: 'bench' } })

      expect(await errorOf(await set(game, game.halo.id))).toEqual({ status: 409, code: 'teams_uneven' })
      expect((await read(game)).setGame?.rejection).toBe('teams_uneven')
      expect(await roundRows(game)).toEqual([])
    })

    it('refuses an empty team with 409 teams_empty', async () => {
      const game = await running()
      for (const key of ['three', 'four'] as const) await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids[key], to: { zone: 'bench' } })

      expect(await errorOf(await set(game, game.halo.id))).toEqual({ status: 409, code: 'teams_empty' })
    })

    it('refuses once as many Rounds have started as the Game count with 409 game_count_reached, until one is put back', async () => {
      const game = await running({ gameCount: 2 })
      await set(game, game.halo.id)
      await set(game, game.kart.id)

      expect(await errorOf(await set(game, game.schach.id))).toEqual({ status: 409, code: 'game_count_reached' })
      expect((await read(game)).setGame?.rejection).toBe('game_count_reached')

      const [first] = await roundRows(game)
      await putBackRound(game, first!.id)
      expect((await set(game, game.schach.id)).status).toBe(200)
    })

    it('refuses while a Round is being drawn with 409 round_being_drawn, and does not put that Round back', async () => {
      const game = await running()
      const [drawn] = await testDb.db.insert(rounds).values({ eventId: game.eventId, startedAt: new Date(T0) }).returning()

      expect(await errorOf(await set(game, game.halo.id))).toEqual({ status: 409, code: 'round_being_drawn' })
      expect((await read(game)).setGame?.rejection).toBe('round_being_drawn')
      expect(await errorOf(await putBackRound(game, drawn!.id))).toEqual({ status: 409, code: 'round_being_drawn' })
    })

    it('writes and tells nothing when it refuses', async () => {
      const game = await running()
      await send('POST', `/api/e/${game.slug}/move`, game.hostCookie, { userId: game.ids.four, to: { zone: 'bench' } })
      notifier.clear()
      await testDb.db.delete(activity)

      await set(game, game.halo.id)

      expect(await roundRows(game)).toEqual([])
      expect(await drawRows()).toEqual([])
      expect(await testDb.db.select().from(activity)).toEqual([])
      expect(notifier.messages(game.eventId)).toEqual([])
    })
  })

  describe('putting a Round back', () => {
    it('removes the Round from the stage, returns a pool game to the games left, and tells the room', async () => {
      const game = await running()
      await set(game, game.halo.id)
      const [round] = await roundRows(game)
      clock.advance(5 * 60_000)
      notifier.clear()

      const response = await putBackRound(game, round!.id)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ roundId: round!.id })
      const view = await read(game)
      expect(view.rounds).toEqual([])
      expect(view.setGame?.left.sort()).toEqual([game.halo.id, game.kart.id].sort())
      expect((await roundRows(game))[0]).toMatchObject({ gameId: game.halo.id, putBackAt: new Date('2090-10-30T10:05:00.000Z') })
      expect(notifier.messages(game.eventId).map(message => message.type)).toEqual(['event.changed', 'activity.added', 'round.putBack'])
    })

    it('returns a library game nowhere: the pool is as it was', async () => {
      const game = await running()
      await set(game, game.schach.id)
      const [round] = await roundRows(game)

      await putBackRound(game, round!.id)

      const view = await read(game)
      expect(view.rounds).toEqual([])
      expect(view.setGame?.left.sort()).toEqual([game.halo.id, game.kart.id].sort())
      expect((view.pools?.main ?? []).map(poolGame => poolGame.name)).toEqual(['Halo', 'Kart'])
    })

    it('writes the feed entry „game put back“ naming the game', async () => {
      const game = await running()
      await set(game, game.halo.id)
      const [round] = await roundRows(game)

      await putBackRound(game, round!.id)

      const page = await (await send('GET', `/api/e/${game.slug}/activity`, game.cookies.one)).json() as ActivityPage
      expect(page.entries.map(entry => entry.type)).toEqual(['game_put_back', 'game_set'])
      expect(page.entries[0]).toMatchObject({ actor: { name: 'Hostess' }, params: { roundId: round!.id, gameId: game.halo.id }, games: { [game.halo.id]: 'Halo' } })
    })

    it('keeps the other open Rounds', async () => {
      const game = await running()
      await set(game, game.halo.id)
      await set(game, game.kart.id)
      const [first] = await roundRows(game)

      await putBackRound(game, first!.id)

      expect((await read(game)).rounds.map(round => round.game.name)).toEqual(['Kart'])
    })

    it('is the Host\'s: a Member gets 403 not_host', async () => {
      const game = await running()
      await set(game, game.halo.id)
      const [round] = await roundRows(game)

      expect(await errorOf(await putBackRound(game, round!.id, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect((await read(game)).rounds).toHaveLength(1)
    })

    it('answers 404 round_not_found for an unknown Round, and for one that is put back already', async () => {
      const game = await running()
      await set(game, game.halo.id)
      const [round] = await roundRows(game)
      await putBackRound(game, round!.id)

      expect(await errorOf(await putBackRound(game, round!.id))).toEqual({ status: 404, code: 'round_not_found' })
      expect(await errorOf(await putBackRound(game, '00000000-0000-4000-8000-000000000999'))).toEqual({ status: 404, code: 'round_not_found' })
      expect(await errorOf(await putBackRound(game, 'nonsense'))).toEqual({ status: 404, code: 'round_not_found' })
    })

    it('does not reach another Event\'s Round', async () => {
      const game = await running()
      const other = await testDb.db.insert(events).values({ slug: 'anderes', inviteToken: 'anderes-token', hostId: game.ids.host, name: 'Anderes', phase: 'running' }).returning()
      const [foreign] = await testDb.db.insert(rounds).values({ eventId: other[0]!.id, gameId: game.halo.id, startedAt: new Date(T0), setAt: new Date(T0) }).returning()

      expect(await errorOf(await putBackRound(game, foreign!.id))).toEqual({ status: 404, code: 'round_not_found' })
      expect((await testDb.db.select().from(rounds).where(and(eq(rounds.id, foreign!.id))))[0]!.putBackAt).toBeNull()
    })
  })

  describe('open Rounds and Sessions', () => {
    it('keeps an open Round when the Session ends and shows it again in the next Session', async () => {
      const game = await running()
      await set(game, game.halo.id)

      expect((await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)).status).toBe(200)
      expect((await read(game)).rounds.map(round => round.game.name)).toEqual(['Halo'])
      expect((await read(game, game.cookies.two)).rounds.map(round => round.game.name)).toEqual(['Halo'])

      expect((await send('POST', `/api/e/${game.slug}/sessions/start`, game.hostCookie)).status).toBe(200)
      const view = await read(game)
      expect(view.rounds.map(round => round.game.name)).toEqual(['Halo'])
      expect(view.setGame?.rejection).toBeNull()
    })

    it('counts the Rounds of an earlier Session toward the Game count', async () => {
      const game = await running({ gameCount: 1 })
      await set(game, game.halo.id)
      await send('POST', `/api/e/${game.slug}/sessions/end`, game.hostCookie)
      await send('POST', `/api/e/${game.slug}/sessions/start`, game.hostCookie)

      expect(await errorOf(await set(game, game.kart.id))).toEqual({ status: 409, code: 'game_count_reached' })
    })
  })

  describe('the Game count in the settings', () => {
    const patchCount = (game: Game, gameCount: number) => send('PATCH', `/api/e/${game.slug}/settings`, game.hostCookie, { settings: { gameCount } })

    it('cannot drop below the Rounds started: 409 game_count_below_started, and the floor is in the Event read', async () => {
      const game = await running({ gameCount: 5 })
      await set(game, game.halo.id)
      await set(game, game.kart.id)
      await set(game, game.schach.id)

      expect((await read(game)).settingsFloors).toMatchObject({ gameCount: 3 })
      expect(await errorOf(await patchCount(game, 2))).toEqual({ status: 409, code: 'game_count_below_started' })
      expect((await patchCount(game, 3)).status).toBe(200)
      expect((await read(game)).settings?.gameCount).toBe(3)
    })

    it('does not count a Round that was put back, nor one that has not started', async () => {
      const game = await running({ gameCount: 5 })
      await set(game, game.halo.id)
      await set(game, game.kart.id)
      const [first] = await roundRows(game)
      await putBackRound(game, first!.id)

      expect((await read(game)).settingsFloors).toMatchObject({ gameCount: 1 })
      expect((await patchCount(game, 1)).status).toBe(200)
    })

    it('has no Game count floor before any Round', async () => {
      const game = await running({ gameCount: 5 })

      expect((await read(game)).settingsFloors).toMatchObject({ gameCount: 0 })
      expect((await patchCount(game, 1)).status).toBe(200)
    })
  })
})
