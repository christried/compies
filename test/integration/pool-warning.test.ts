import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { bonusVetoes, rounds, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import { SPIN, WINDOW_MS } from '../draw-offsets'
import { createTestApp, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { readEvent, setUpEvent, startRunningEvent, type Stage } from './scenario'
import { stubAuthEnv } from './sign-in'

// The Host's pool warning (#234, spec #218 § Pool warning) through the Event read: it shows when the games left may not cover the
// Game count less the Rounds started, plus every Party's Vetoes left (Bonus Vetoes included); it never blocks anything, and only the
// Host reads it while the Event runs. A Veto cast on a draw whose window still runs is sealed for the Host unless the Host plays in
// that Party, so the warning does not flip before the window ends.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const people = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
  three: { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com', image: undefined },
  four: { provider: 'twitch', id: '5', name: 'Vier', email: 'four@example.com', image: undefined },
} as const

const T0 = '2090-10-30T10:00:00.000Z'
const { stop: STOP } = SPIN

describe('the Host\'s pool warning (#234)', () => {
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
   * An Event with two Parties of two (One and Two in team 1, Three and Four in team 2) and `poolSize` games in the Game pool. Under the
   * Lucky Wheel the Veto allowance is `allowance` per Party; `started` runs the first Session (the Event is running only then).
   */
  async function event({ wheel = true, allowance = 0, gameCount = 10, poolSize = 4, started = true }: { wheel?: boolean, allowance?: number, gameCount?: number, poolSize?: number, started?: boolean } = {}) {
    const make = started ? startRunningEvent : setUpEvent
    const game = await make(stage, {
      host, players: people, seats: [['one', 1], ['two', 1], ['three', 2], ['four', 2]] as const,
      settings: { teamSize: 2, gameCount, ...(wheel ? { selectionMode: 'lucky_wheel', vetoAllowance: allowance } : {}) },
      games: Array.from({ length: poolSize }, (_, index) => ({ key: `spiel${index + 1}`, values: { name: `Spiel ${index + 1}` }, pool: true })),
    })
    return {
      slug: game.slug, eventId: game.eventId, hostCookie: game.host.cookie,
      cookies: { one: game.players.one.cookie, two: game.players.two.cookie, three: game.players.three.cookie, four: game.players.four.cookie },
      ids: { host: game.host.id, one: game.players.one.id, two: game.players.two.id, three: game.players.three.id, four: game.players.four.id },
    }
  }

  type Party = Awaited<ReturnType<typeof event>>

  async function startNow(party: Party) {
    expect((await send('POST', `/api/e/${party.slug}/sessions/start`, party.hostCookie)).status).toBe(200)
  }

  const read = (party: Party, cookie = party.hostCookie) => readEvent(stage, cookie, party.slug)
  const warningOf = async (party: Party) => (await read(party)).setGame?.poolWarning
  const spin = (party: Party) => send('POST', `/api/e/${party.slug}/rounds/spin`, party.hostCookie)
  const cast = (party: Party, drawId: string, cookie: string) => send('POST', `/api/e/${party.slug}/draws/${drawId}/veto`, cookie)

  it('warns the Host when the games left cannot cover the Game count and every Party\'s Vetoes: the numbers of the rule', async () => {
    // Game count 10 and two Vetoes per Party (2 Parties): 14 games may be needed, 4 are in the pool.
    const party = await event({ allowance: 2, gameCount: 10, poolSize: 4 })

    expect(await warningOf(party)).toEqual({ needed: 14, have: 4 })
  })

  it('is silent when the games left cover the worst case, exactly enough included', async () => {
    // Game count 4 without Vetoes: the pool of 4 is exactly enough.
    const party = await event({ allowance: 0, gameCount: 4, poolSize: 4 })

    expect(await warningOf(party)).toBeNull()
  })

  it('counts Bonus Vetoes of a Party, and warns at once when they make the pool run short', async () => {
    const party = await event({ allowance: 0, gameCount: 2, poolSize: 3 })
    expect(await warningOf(party)).toBeNull()

    await testDb.db.insert(bonusVetoes).values([1, 2].map(() => ({ eventId: party.eventId, team: 1, grantedBy: party.ids.host, grantedAt: new Date(T0) })))

    expect(await warningOf(party)).toEqual({ needed: 4, have: 3 })
  })

  it('shows under Host pick the Game count less the Rounds started, without any Vetoes', async () => {
    const party = await event({ wheel: false, gameCount: 5, poolSize: 4 })

    expect(await warningOf(party)).toEqual({ needed: 5, have: 4 })
  })

  it('shows the warning only while the Event runs: the setup hint covers the time before the first Session', async () => {
    const party = await event({ allowance: 2, gameCount: 10, poolSize: 4, started: false })
    expect(await warningOf(party)).toBeNull()

    await startNow(party)

    expect(await warningOf(party)).toEqual({ needed: 14, have: 4 })
  })

  it('leaves the Host\'s warning unchanged by a sealed Veto of a Party the Host is not in, until the window ends, then counts it', async () => {
    // Game count 2, one Veto per Party: 2 games + 2 Vetoes = 4 needed, 3 in the pool.
    const party = await event({ allowance: 1, gameCount: 2, poolSize: 3 })
    expect(await warningOf(party)).toEqual({ needed: 4, have: 3 })

    const spun = await spin(party)
    expect(spun.status).toBe(200)
    const { drawId } = await spun.json() as { drawId: string }
    // The drawn game is out of the pool while its window runs: one Round started, 2 games left.
    expect(await warningOf(party)).toEqual({ needed: 3, have: 2 })

    clock.advance(STOP)
    expect((await cast(party, drawId, party.cookies.one)).status).toBe(200)
    // Team 1 cast its Veto, sealed: the Host, outside the teams, still counts both Parties' Vetoes.
    expect(await warningOf(party)).toEqual({ needed: 3, have: 2 })

    clock.advance(WINDOW_MS)
    const view = await read(party)

    // The draw is vetoed: its Round waits for a respin, so it needs its game again; the vetoed game stays out of the pool.
    expect(view.setGame?.respin).toBe(true)
    expect(view.setGame?.poolWarning).toEqual({ needed: 3, have: 2 })
    expect(await testDb.db.select().from(rounds).where(eq(rounds.eventId, party.eventId))).toMatchObject([{ gameId: null, setAt: null }])
    expect(await testDb.db.select().from(vetoes)).toHaveLength(1)
  })
})
