import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { draws, events } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { Db } from '../../server/utils/db'
import { readEventState, withParts } from '../../server/utils/event-state'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { WINDOW_MS } from '../draw-offsets'
import { createTestApp, errorOf, sendVia } from './app'
import { createInterleavingDb, createTestDb, resetDatabase } from './harness'
import { clockToEnd, clockToStop, hostEntersResult, hostPutsBack, hostSpins, hostTossesCoin, readEvent, setUpEvent, startRunningEvent, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// The Event state (#416) on a real database: the Rounds statement's folds (moved here from results.test.ts, assertions unchanged), what each part
// costs and what it leaves unread, and that the reason the Event read shows for a rule is the reason its route answers with (the state is the one
// source of both). The rules' reasons in every order and edge are test/unit/event-state.test.ts; the statements under the lock are lock-statements.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com' } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com' },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com' },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com' },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com' },
} as const
const T0 = '2090-10-30T10:00:00.000Z'
const twoParties = [{ team: 1, place: 1, score: ' 16 ' }, { team: 2, place: 2, score: '' }]

describe('the Event state', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let counted: Db
  let rig: Rig
  const log: string[] = []
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    testDb = await createTestDb()
    // The same database, with a logger: the statements each part runs are counted from it.
    const logger = {
      logQuery(query: string) {
        log.push(query)
      },
    }
    counted = drizzle({ client: testDb.client, schema, logger }) as unknown as Db
    rig = { request: createTestApp(counted, { roomNotifier: notifier, clock }), db: counted, clock, notifier }
  })
  afterAll(async () => {
    await testDb.client.close()
  })
  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await resetDatabase(counted)
  })
  afterEach(() => vi.unstubAllEnvs())

  const send = sendVia(() => rig.request)
  const games = [
    { key: 'halo', values: { name: 'Halo' }, pool: true },
    { key: 'kart', values: { name: 'Kart' }, pool: true },
    { key: 'schach', values: { name: 'Schach' }, pool: false },
  ] as const
  const wheel = { teamCount: 2, teamSize: 2, gameCount: 3, selectionMode: 'lucky_wheel', vetoAllowance: 1, pointsTable: { preset: 'linear', values: [1, 0] } } as const
  const seats = [['one', 1], ['two', 1], ['three', 2], ['four', 2]] as const

  const running = (settings: Record<string, unknown> = wheel) => startRunningEvent(rig, { host, players, seats, settings, games, quiet: 'room-and-feed' })
  const eventRowOf = async (eventId: string) => (await counted.select().from(events).where(eq(events.id, eventId)))[0]!
  const setRound = async (ev: { slug: string, host: { cookie: string } }, gameId: string, vetoAllowed?: boolean) =>
    (await (await send('POST', `/api/e/${ev.slug}/rounds`, ev.host.cookie, vetoAllowed === undefined ? { gameId } : { gameId, vetoAllowed })).json() as { roundId: string }).roundId

  describe('the Rounds part', () => {
    it('reads every draw with its Round in one statement, and the Rounds in start order with the put-back one', async () => {
      const ev = await running({ ...wheel, vetoAllowance: 1 })
      const windowed = await setRound(ev, ev.games.halo.id, true)
      const [draw] = await counted.select().from(draws).where(eq(draws.roundId, windowed))
      expect((await send('POST', `/api/e/${ev.slug}/draws/${draw!.id}/veto`, ev.players.one.cookie)).status).toBe(200)
      clock.advance(WINDOW_MS)
      await setRound(ev, ev.games.kart.id)
      const put = await setRound(ev, ev.games.schach.id)
      await hostPutsBack(rig, ev, put)
      const eventRow = await eventRowOf(ev.eventId)

      const state = await readEventState(counted, eventRow, clock.now(), ['rounds'])

      expect(state.rounds.map(entry => entry.round.id)).toEqual([windowed, put])
      expect(state.draws).toHaveLength(3)
      expect(state.draws.filter(row => row.roundId === windowed)).toHaveLength(2)
      const roundIds = new Set(state.rounds.map(entry => entry.round.id))
      expect(state.draws.every(row => roundIds.has(row.roundId))).toBe(true)
    })

    it('reads a Round and its Places from one statement: a Result that commits while the read runs never shows the Round as open and with its Result (Spec N2)', async () => {
      const ev = await running()
      const round = await setRound(ev, ev.games.halo.id)
      const eventRow = await eventRowOf(ev.eventId)
      // The Result commits just as the read reaches the statement that reads the Rounds and their draws.
      const racingDb = createInterleavingDb(testDb.client, /"draws"/, () => send('PUT', `/api/e/${ev.slug}/rounds/${round}/result`, ev.host.cookie, { places: twoParties }), 5000)

      const state = await readEventState(racingDb, eventRow, clock.now(), ['rounds'])

      expect(state.results.map(entry => entry.round.id)).toEqual(state.rounds.filter(entry => entry.round.resultAt !== null).map(entry => entry.round.id))
      expect(state.results).toHaveLength(1)
      expect(state.results[0]!.places).toEqual([{ team: 1, place: 1, score: '16' }, { team: 2, place: 2, score: null }])
    })

    it('reads each draw and each Place once when a Round has several draws and a Result', async () => {
      const ev = await running()
      const round = await setRound(ev, ev.games.halo.id)
      await hostEntersResult(rig, ev, round, twoParties.map(({ team, place }) => ({ team, place })))
      const [first] = await counted.select().from(draws).where(eq(draws.roundId, round))
      await counted.insert(draws).values({ ...first!, id: crypto.randomUUID() })
      const eventRow = await eventRowOf(ev.eventId)

      const state = await readEventState(counted, eventRow, clock.now(), ['rounds'])

      expect(state.draws.filter(row => row.roundId === round)).toHaveLength(2)
      expect(state.results).toHaveLength(1)
      expect(state.results[0]!.places.map(place => place.team)).toEqual([1, 2])
    })
  })

  describe('the parts', () => {
    /** The tables a statement reads from, in the order it names them. */
    const tablesOf = (statement: string) => [...statement.matchAll(/(?:from|join) "([a-z_]+)"/g)].map(match => match[1]!)
    const statementsOf = async (read: () => Promise<unknown>) => {
      log.length = 0
      await read()
      return log.filter(statement => statement.startsWith('select'))
    }

    it('reads each part with one statement, and a part nobody asked for is not read', async () => {
      const ev = await running()
      const eventRow = await eventRowOf(ev.eventId)
      const read = (parts: Parameters<typeof readEventState>[3]) => statementsOf(() => readEventState(counted, eventRow, clock.now(), parts))

      expect((await read(['sessions'])).map(tablesOf)).toEqual([['sessions']])
      expect((await read(['members'])).map(tablesOf)).toEqual([['event_members', 'users']])
      expect((await read(['teams'])).map(tablesOf)).toEqual([['event_teams']])
      expect((await read(['rounds'])).map(tablesOf)).toEqual([['rounds', 'games', 'draws', 'round_places']])
      expect((await read(['vetoes'])).map(tablesOf)).toEqual([['vetoes', 'draws', 'rounds']])
      expect((await read(['bonus'])).map(tablesOf)).toEqual([['bonus_vetoes']])
      expect((await read(['pool'])).map(tablesOf)).toEqual([['event_pool_games', 'games']])
      expect(await read([])).toEqual([])
    })

    it('reads the Coin flip after the Sessions, one statement for each, and refuses to read it without them', async () => {
      const ev = await running()
      await hostTossesCoin(rig, ev)
      const eventRow = await eventRowOf(ev.eventId)

      const statements = await statementsOf(() => readEventState(counted, eventRow, clock.now(), ['toss', 'sessions']))
      const state = await readEventState(counted, eventRow, clock.now(), ['sessions', 'toss'])

      expect(statements.map(tablesOf)).toEqual([['sessions'], ['coin_tosses']])
      expect(state.toss).toMatchObject({ side: expect.stringMatching(/heads|tails/) })
      await expect(readEventState(counted, eventRow, clock.now(), ['toss'])).rejects.toThrow(/after the Sessions/)
    })

    it('has no toss without a Running Session', async () => {
      const ev = await running()
      await hostTossesCoin(rig, ev)
      expect((await send('POST', `/api/e/${ev.slug}/sessions/end`, ev.host.cookie)).status).toBe(200)
      const eventRow = await eventRowOf(ev.eventId)

      expect((await readEventState(counted, eventRow, clock.now(), ['sessions', 'toss'])).toss).toBeNull()
    })

    it('withParts reads only the parts the state does not have yet', async () => {
      const ev = await running()
      const eventRow = await eventRowOf(ev.eventId)
      const base = await readEventState(counted, eventRow, clock.now(), ['sessions', 'rounds'])

      const statements = await statementsOf(() => withParts(counted, base, ['sessions', 'vetoes', 'rounds', 'bonus']))
      const more = await withParts(counted, base, ['vetoes', 'toss'])

      expect(statements.map(tablesOf)).toEqual([['vetoes', 'draws', 'rounds'], ['bonus_vetoes']])
      expect(more.sessions).toBe(base.sessions)
      expect(more.vetoes).toEqual([])
      expect(more.toss).toBeNull()
    })
  })

  // The dock's reason is the route's refusal (the Event read shows what the route enforces): the read first, then the route, the same code.
  describe('the dock’s reason equals the route’s refusal', () => {
    const refusal = async (response: Promise<Response>) => (await errorOf(await response)).code

    it('setting a game: a Round being drawn', async () => {
      const ev = await running()
      await hostSpins(rig, ev)

      expect((await readEvent(rig, ev.host.cookie, ev.slug)).setGame?.rejection).toBe('round_being_drawn')
      expect(await refusal(send('POST', `/api/e/${ev.slug}/rounds`, ev.host.cookie, { gameId: ev.games.schach.id }))).toBe('round_being_drawn')
    })

    it('spinning the wheel: a Round being drawn, and an empty pool', async () => {
      const ev = await running()
      await hostSpins(rig, ev)
      expect((await readEvent(rig, ev.host.cookie, ev.slug)).setGame?.spinRejection).toBe('round_being_drawn')
      expect(await refusal(send('POST', `/api/e/${ev.slug}/rounds/spin`, ev.host.cookie))).toBe('round_being_drawn')

      const empty = await running({ ...wheel, gameCount: 5 })
      await send('PATCH', `/api/e/${empty.slug}/settings`, empty.host.cookie, { pool: [] })
      expect((await readEvent(rig, empty.host.cookie, empty.slug)).setGame?.spinRejection).toBe('pool_empty')
      expect(await refusal(send('POST', `/api/e/${empty.slug}/rounds/spin`, empty.host.cookie))).toBe('pool_empty')
    })

    it('a Veto: the window is closed', async () => {
      const ev = await running()
      const { drawId } = await hostSpins(rig, ev)
      await clockToStop(rig, drawId)
      expect((await readEvent(rig, ev.players.one.cookie, ev.slug)).wheel?.vetoes.own?.rejection).toBeNull()
      await clockToEnd(rig, drawId)

      expect((await readEvent(rig, ev.players.one.cookie, ev.slug)).wheel?.vetoes.own?.rejection).toBe('veto_window_closed')
      expect(await refusal(send('POST', `/api/e/${ev.slug}/draws/${drawId}/veto`, ev.players.one.cookie))).toBe('veto_window_closed')
    })

    it('a Bonus Veto: the Event is finished', async () => {
      const ev = await running({ ...wheel, gameCount: 1 })
      const round = await setRound(ev, ev.games.halo.id)
      await hostEntersResult(rig, ev, round, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      expect((await send('POST', `/api/e/${ev.slug}/finish`, ev.host.cookie, { outcome: 'winner', winners: [1] })).status).toBe(200)

      expect((await readEvent(rig, ev.host.cookie, ev.slug)).bonusVetoes?.rejection).toBe('wrong_phase')
      expect(await refusal(send('POST', `/api/e/${ev.slug}/bonus-vetoes`, ev.host.cookie, { team: 1 }))).toBe('wrong_phase')
    })

    it('the finish: a Round is missing a Result', async () => {
      const ev = await running({ ...wheel, gameCount: 2 })
      await hostEntersResult(rig, ev, await setRound(ev, ev.games.halo.id), [{ team: 1, place: 1 }, { team: 2, place: 2 }])

      expect((await readEvent(rig, ev.host.cookie, ev.slug)).end?.finish?.rejection).toBe('results_missing')
      expect(await refusal(send('POST', `/api/e/${ev.slug}/finish`, ev.host.cookie, { outcome: 'winner', winners: [1] }))).toBe('results_missing')
    })

    it('the last game: no Tie stands', async () => {
      const ev = await running({ ...wheel, gameCount: 1 })
      await hostEntersResult(rig, ev, await setRound(ev, ev.games.halo.id), [{ team: 1, place: 1 }, { team: 2, place: 2 }])

      expect((await readEvent(rig, ev.host.cookie, ev.slug)).end?.lastGame?.rejection).toBe('no_tie')
      expect(await refusal(send('POST', `/api/e/${ev.slug}/last-game`, ev.host.cookie))).toBe('no_tie')
    })

    it('starting a Session: the teams are uneven', async () => {
      const ev = await setUpEvent(rig, { host, players, seats: [['one', 1], ['two', 1], ['three', 2]], settings: wheel, games, quiet: 'room-and-feed' })

      expect((await readEvent(rig, ev.host.cookie, ev.slug)).start?.rejection).toBe('teams_uneven')
      expect(await refusal(send('POST', `/api/e/${ev.slug}/sessions/start`, ev.host.cookie))).toBe('teams_uneven')
    })

    it('a move: Team choice is closed', async () => {
      // No Session has a Date yet, so the Players cannot take a seat in a team.
      const ev = await setUpEvent(rig, { host, players, seats: [], settings: wheel, games, sessions: 1, slots: ['2090-10-30T20:30'], confirmed: 0, quiet: 'room-and-feed' })
      expect((await readEvent(rig, ev.players.one.cookie, ev.slug)).teamChoiceOpen).toBe(false)

      expect(await refusal(send('POST', `/api/e/${ev.slug}/move`, ev.players.one.cookie, { userId: ev.players.one.id, to: { zone: 'team', team: 1 } }))).toBe('team_choice_closed')
    })

    it('a settings floor: the Game count below the Rounds started', async () => {
      const ev = await running({ ...wheel, gameCount: 5 })
      await setRound(ev, ev.games.halo.id)
      await setRound(ev, ev.games.kart.id)

      expect((await readEvent(rig, ev.host.cookie, ev.slug)).settingsFloors).toMatchObject({ gameCount: 2 })
      expect(await refusal(send('PATCH', `/api/e/${ev.slug}/settings`, ev.host.cookie, { settings: { gameCount: 1 } }))).toBe('game_count_below_started')
      expect((await send('PATCH', `/api/e/${ev.slug}/settings`, ev.host.cookie, { settings: { gameCount: 2 } })).status).toBe(200)
    })
  })
})
