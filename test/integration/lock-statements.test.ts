import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { Db } from '../../server/utils/db'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { createTestApp, sendVia } from './app'
import { createTestDb, resetDatabase } from './harness'
import { clockToEnd, clockToStop, hostEntersResult, hostSets, hostSpins, playerVetoes, setUpEvent, startRunningEvent, type GameSeed, type Rig } from './scenario'
import { stubAuthEnv } from './sign-in'

// The statements a write route runs under the Event row lock (#416). The Event state is read in parts, each route asks for the parts its
// rules need, and no route may run more statements than the heaviest one did when the module was built (POST rounds with „Veto erlauben“:
// 16 on this fixture). Counted through drizzle's logger from the statement after the `for update` of loadEvent until the handler returns, so
// `isMember` and `settleDue`'s select count, the lock itself, BEGIN, COMMIT and the sign-in lookups do not. A new rule that needs one more
// fact reads one more part in the routes that need it; a route that goes over the budget reads that part lazily or not at all.

const LOCK_BUDGET = 16

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com' } as const
const players = {
  a: { provider: 'discord', id: '2', name: 'Eins', email: 'a@example.com' },
  b: { provider: 'discord', id: '3', name: 'Zwei', email: 'b@example.com' },
  c: { provider: 'twitch', id: '4', name: 'Drei', email: 'c@example.com' },
  d: { provider: 'twitch', id: '5', name: 'Vier', email: 'd@example.com' },
  e: { provider: 'twitch', id: '6', name: 'Fünf', email: 'e@example.com' },
} as const
const seats = [['a', 1], ['b', 1], ['c', 2], ['d', 2], ['e', 'stands']] as const
const wheel = { teamCount: 2, teamSize: 2, gameCount: 6, selectionMode: 'lucky_wheel', vetoAllowance: 2, hiddenWheel: false } as const

type Call = () => Promise<Response>

describe('statements under the Event row lock (#416)', () => {
  let client: PGlite
  let counted: Db
  let rig: Rig
  const log: string[] = []
  const notifier = memoryRoomNotifier()
  const clock = testClock('2090-10-30T10:00:00.000Z')
  let testDb: Awaited<ReturnType<typeof createTestDb>>

  beforeAll(async () => {
    testDb = await createTestDb()
    client = testDb.client
    // The same database, with a logger: the app and the scenario verbs run on it.
    const logger = {
      logQuery(query: string) {
        log.push(query)
      },
    }
    counted = drizzle({ client, schema, logger }) as unknown as Db
    rig = { request: createTestApp(counted, { roomNotifier: notifier, clock }), db: counted, clock, notifier }
  })
  afterAll(async () => {
    await client.close()
  })
  beforeEach(async () => {
    stubAuthEnv()
    clock.set('2090-10-30T10:00:00.000Z')
    notifier.clear()
    await resetDatabase(counted)
  })
  afterEach(() => vi.unstubAllEnvs())

  const send = sendVia(() => rig.request)
  const poolKeys = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'] as const
  const pool = poolKeys.map(key => ({
    key,
    // G1 has a clip, so POST clip/skip has one to skip.
    values: key === 'G1' ? { name: key, youtubeId: 'abcdefghijk', clipStart: 0, clipLength: 30 } : { name: key },
    pool: true,
  }) satisfies GameSeed)
  const library = { key: 'LIB' as const, values: { name: 'LIB' }, pool: false } satisfies GameSeed

  const running = (settings: Record<string, unknown> = wheel) => startRunningEvent(rig, { host, players, seats: [...seats], settings, games: [...pool, library] })
  const notStarted = () => setUpEvent(rig, { host, players, seats: [...seats], settings: wheel, games: [...pool, library] })

  /** A running Event with history: a Round with a Result, an open Round (G3) and a Bonus Veto for team 1. */
  async function rich(settings: Record<string, unknown> = wheel) {
    const ev = await running(settings)
    const done = await hostSets(rig, ev, ev.games.G2.id)
    await hostEntersResult(rig, ev, done, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    const open = await hostSets(rig, ev, ev.games.G3.id)
    await send('POST', `/api/e/${ev.slug}/bonus-vetoes`, ev.host.cookie, { team: 1 })
    return { ev, open }
  }

  /** The statements after the Event row's lock until the handler returned. */
  async function underLock(call: Call) {
    log.length = 0
    const response = await call()
    const lockAt = log.findIndex(statement => /from "events"/.test(statement) && /for (update|share)\s*$/i.test(statement))
    return { status: response.status, count: lockAt < 0 ? -1 : log.length - lockAt - 1 }
  }

  const ok = async (response: Promise<Response>) => expect((await response).status).toBe(200)

  const routes: [string, () => Promise<Call>][] = [
    ['POST rounds (set)', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/rounds`, ev.host.cookie, { gameId: ev.games.G4.id })
    }],
    ['POST rounds (set, Veto erlauben)', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/rounds`, ev.host.cookie, { gameId: ev.games.G4.id, vetoAllowed: true })
    }],
    ['POST rounds/spin', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/rounds/spin`, ev.host.cookie)
    }],
    ['POST draws/:id/veto', async () => {
      const { ev } = await rich()
      const { drawId } = await hostSpins(rig, ev)
      await clockToStop(rig, drawId)
      return () => send('POST', `/api/e/${ev.slug}/draws/${drawId}/veto`, ev.players.a.cookie)
    }],
    ['DELETE rounds/:id', async () => {
      const { ev, open } = await rich()
      return () => send('DELETE', `/api/e/${ev.slug}/rounds/${open}`, ev.host.cookie)
    }],
    ['PUT rounds/:id/result (enter)', async () => {
      const { ev, open } = await rich()
      return () => send('PUT', `/api/e/${ev.slug}/rounds/${open}/result`, ev.host.cookie, { places: [{ team: 1, place: 2 }, { team: 2, place: 1 }] })
    }],
    ['PUT rounds/:id/result (correct)', async () => {
      const { ev, open } = await rich()
      await ok(send('PUT', `/api/e/${ev.slug}/rounds/${open}/result`, ev.host.cookie, { places: [{ team: 1, place: 2 }, { team: 2, place: 1 }] }))
      return () => send('PUT', `/api/e/${ev.slug}/rounds/${open}/result`, ev.host.cookie, { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] })
    }],
    ['POST bonus-vetoes', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/bonus-vetoes`, ev.host.cookie, { team: 2 })
    }],
    ['POST coin', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/coin`, ev.host.cookie)
    }],
    ['PUT countdown', async () => {
      const { ev } = await rich()
      return () => send('PUT', `/api/e/${ev.slug}/countdown`, ev.host.cookie, { seconds: 60 })
    }],
    // A vetoed draw whose window has ended is settled by the first write after it (#231): its feed entry reads the Team names of the casting Parties (#440).
    // This stands for every lock-holding route and the two reads that call `settleBeforeRead`.
    ['PUT countdown (a vetoed draw is due)', async () => {
      const { ev } = await rich()
      const { drawId } = await hostSpins(rig, ev)
      await clockToStop(rig, drawId)
      await playerVetoes(rig, ev, drawId, ev.players.a)
      await clockToEnd(rig, drawId)
      return () => send('PUT', `/api/e/${ev.slug}/countdown`, ev.host.cookie, { seconds: 60 })
    }],
    ['POST countdown/start', async () => {
      const { ev } = await rich()
      await ok(send('PUT', `/api/e/${ev.slug}/countdown`, ev.host.cookie, { seconds: 60 }))
      return () => send('POST', `/api/e/${ev.slug}/countdown/start`, ev.host.cookie)
    }],
    ['POST clip/skip', async () => {
      const ev = await running()
      await hostSets(rig, ev, ev.games.G1.id)
      return () => send('POST', `/api/e/${ev.slug}/clip/skip`, ev.host.cookie)
    }],
    ['POST move', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/move`, ev.host.cookie, { userId: ev.players.a.id, to: { zone: 'stands' } })
    }],
    // A move into a team reads the Team name its entry stores (#440): one select more than a move to the Stands, which names no team.
    ['POST move (into a team)', async () => {
      const { ev } = await rich()
      await ok(send('POST', `/api/e/${ev.slug}/move`, ev.host.cookie, { userId: ev.players.a.id, to: { zone: 'stands' } }))
      return () => send('POST', `/api/e/${ev.slug}/move`, ev.host.cookie, { userId: ev.players.e.id, to: { zone: 'team', team: 1 } })
    }],
    ['POST sessions/end', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/sessions/end`, ev.host.cookie)
    }],
    ['POST sessions/start (the next)', async () => {
      const { ev } = await rich()
      await ok(send('POST', `/api/e/${ev.slug}/sessions/end`, ev.host.cookie))
      return () => send('POST', `/api/e/${ev.slug}/sessions/start`, ev.host.cookie)
    }],
    ['POST sessions/start (the first)', async () => {
      const ev = await notStarted()
      return () => send('POST', `/api/e/${ev.slug}/sessions/start`, ev.host.cookie)
    }],
    ['PATCH settings (Game count)', async () => {
      const { ev } = await rich()
      return () => send('PATCH', `/api/e/${ev.slug}/settings`, ev.host.cookie, { settings: { gameCount: 7 } })
    }],
    ['PATCH settings (pool only)', async () => {
      const { ev } = await rich()
      return () => send('PATCH', `/api/e/${ev.slug}/settings`, ev.host.cookie, { pool: [ev.games.G1.id, ev.games.G4.id, ev.games.G5.id] })
    }],
    ['PATCH settings (Game count and pool)', async () => {
      const { ev } = await rich()
      return () => send('PATCH', `/api/e/${ev.slug}/settings`, ev.host.cookie, { settings: { gameCount: 7 }, pool: [ev.games.G1.id, ev.games.G4.id, ev.games.G5.id, ev.games.G6.id] })
    }],
    ['PATCH settings (team count 3 to 2, two Players move)', async () => {
      const ev = await setUpEvent(rig, {
        host, players, seats: [['a', 1], ['b', 1], ['c', 3], ['d', 3], ['e', 'stands']], settings: { ...wheel, teamCount: 3, pointsTable: { preset: 'linear', values: [2, 1, 0] } }, games: [...pool, library],
      })
      return () => send('PATCH', `/api/e/${ev.slug}/settings`, ev.host.cookie, { settings: { teamCount: 2, pointsTable: { preset: 'linear', values: [1, 0] } } })
    }],
    ['POST team-word', async () => {
      const ev = await notStarted()
      return () => send('POST', `/api/e/${ev.slug}/team-word`, ev.players.a.cookie, { word: 'Gurken' })
    }],
    // The word and the reset work in a running Event too (#438), where the Event state has the most to read.
    ['POST team-word (running Event)', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/team-word`, ev.players.a.cookie, { word: 'Gurken' })
    }],
    ['POST teams/:position/reset-name', async () => {
      const ev = await notStarted()
      return () => send('POST', `/api/e/${ev.slug}/teams/1/reset-name`, ev.host.cookie)
    }],
    ['POST teams/:position/reset-name (running Event)', async () => {
      const { ev } = await rich()
      return () => send('POST', `/api/e/${ev.slug}/teams/1/reset-name`, ev.host.cookie)
    }],
    ['POST finish', async () => {
      const ev = await twoResults(false)
      return () => send('POST', `/api/e/${ev.slug}/finish`, ev.host.cookie, { outcome: 'winner', winners: [1] })
    }],
    ['POST last-game', async () => {
      const ev = await twoResults(true)
      return () => send('POST', `/api/e/${ev.slug}/last-game`, ev.host.cookie)
    }],
    ['POST ceremony', async () => {
      const ev = await twoResults(false)
      await ok(send('POST', `/api/e/${ev.slug}/finish`, ev.host.cookie, { outcome: 'winner', winners: [1] }))
      return () => send('POST', `/api/e/${ev.slug}/ceremony`, ev.host.cookie)
    }],
  ]

  /** A running Host-pick Event of two games with both Results in: team 1 wins both, or (tie) one each. */
  async function twoResults(tie: boolean) {
    const ev = await running({ ...wheel, gameCount: 2, selectionMode: 'admin_pick', vetoAllowance: null })
    const first = await hostSets(rig, ev, ev.games.G2.id)
    await hostEntersResult(rig, ev, first, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    const second = await hostSets(rig, ev, ev.games.G3.id)
    await hostEntersResult(rig, ev, second, tie ? [{ team: 1, place: 2 }, { team: 2, place: 1 }] : [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    return ev
  }

  it.each(routes)('%s runs within the budget under the lock', async (_name, prepare) => {
    const call = await prepare()

    const { status, count } = await underLock(call)

    expect(status).toBe(200)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(LOCK_BUDGET)
  }, 30_000)

  it('the Event read selects each part of the state once: the Vetoes, the Rounds and the Members are read one time for a Host on a Lucky Wheel Event', async () => {
    const { ev } = await rich()
    log.length = 0

    expect((await send('GET', `/api/e/${ev.slug}`, ev.host.cookie)).status).toBe(200)

    const reads = (table: string) => log.filter(statement => statement.startsWith('select') && new RegExp(`from "${table}"`).test(statement)).length
    expect(reads('vetoes')).toBe(1)
    expect(reads('bonus_vetoes')).toBe(1)
    expect(reads('rounds')).toBe(1)
    // loadEvent's isMember and the Members with their profile: two, not three (the floors read the seats a second time today).
    expect(reads('event_members')).toBe(2)
  }, 30_000)
})
