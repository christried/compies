import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import readEvent from '../../server/api/e/[slug].get'
import confirmDate from '../../server/api/e/[slug]/confirm.post'
import castVeto from '../../server/api/e/[slug]/draws/[drawId]/veto.post'
import moveMember from '../../server/api/e/[slug]/move.post'
import setGame from '../../server/api/e/[slug]/rounds/index.post'
import spinWheel from '../../server/api/e/[slug]/rounds/spin.post'
import startSession from '../../server/api/e/[slug]/sessions/start.post'
import createEvent from '../../server/api/e/index.post'
import { bonusVetoes, draws, eventMembers, eventPoolGames, events, games, pollSlots, rounds, users, vetoes } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { Place } from '../../shared/board'
import type { EventView } from '../../shared/event'
import { VETO_WINDOW_MS } from '../../shared/rounds'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

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

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'
const LEAD = 1500
const STOP = LEAD + 6000

describe('the Host\'s pool warning (#234)', () => {
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
      'POST /api/e/:slug/rounds': setGame,
      'POST /api/e/:slug/rounds/spin': spinWheel,
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
    await testDb.db.delete(bonusVetoes)
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

  const team = (n: number): Place => ({ zone: 'team', team: n })

  function send(method: string, path: string, cookie: string | undefined, body?: unknown) {
    return request(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  /**
   * An Event with two Parties of two (One and Two in team 1, Three and Four in team 2) and `poolSize` games in the Game pool. Under the
   * Lucky Wheel the Veto allowance is `allowance` per Party; `start` runs the first Session (the Event is running only then).
   */
  async function event({ wheel = true, allowance = 0, gameCount = 10, poolSize = 4, start = true }: { wheel?: boolean, allowance?: number, gameCount?: number, poolSize?: number, start?: boolean } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = {} as Record<keyof typeof people, string>
    for (const [key, profile] of Object.entries(people)) cookies[key as keyof typeof people] = (await signIn(testDb.db, profile)).cookie
    const created = await send('POST', '/api/e', hostCookie, {
      name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS,
      settings: { ...TEST_SETTINGS, teamSize: 2, gameCount, ...(wheel ? { selectionMode: 'lucky_wheel', vetoAllowance: allowance } : {}) },
    })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    const eventId = eventRow!.id
    const ids = {} as Record<'host' | keyof typeof people, string>
    for (const [key, profile] of Object.entries({ host, ...people })) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      ids[key as keyof typeof ids] = row!.id
    }
    for (const key of Object.keys(people) as (keyof typeof people)[]) await testDb.db.insert(eventMembers).values({ eventId, userId: ids[key] })
    const pool = await testDb.db.insert(games).values(Array.from({ length: poolSize }, (_, index) => ({ name: `Spiel ${index + 1}`, createdBy: ids.host }))).returning()
    await testDb.db.insert(eventPoolGames).values(pool.map(game => ({ eventId, gameId: game.id })))

    const slotIds = (await testDb.db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
    for (const slotId of slotIds) expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId })).status).toBe(200)
    const seats = [['one', team(1)], ['two', team(1)], ['three', team(2)], ['four', team(2)]] as const
    for (const [key, to] of seats) expect((await send('POST', `/api/e/${slug}/move`, cookies[key], { userId: ids[key], to })).status).toBe(200)
    const party = { slug, eventId, hostCookie, cookies, ids }
    if (start) await startNow(party)
    notifier.clear()
    return party
  }

  type Party = Awaited<ReturnType<typeof event>>

  async function startNow(party: Party) {
    expect((await send('POST', `/api/e/${party.slug}/sessions/start`, party.hostCookie)).status).toBe(200)
  }

  const read = async (party: Party, cookie = party.hostCookie) => await (await send('GET', `/api/e/${party.slug}`, cookie)).json() as EventView
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
    const party = await event({ allowance: 2, gameCount: 10, poolSize: 4, start: false })
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

    clock.advance(VETO_WINDOW_MS)
    const view = await read(party)

    // The draw is vetoed: its Round waits for a respin, so it needs its game again; the vetoed game stays out of the pool.
    expect(view.setGame?.respin).toBe(true)
    expect(view.setGame?.poolWarning).toEqual({ needed: 3, have: 2 })
    expect(await testDb.db.select().from(rounds).where(eq(rounds.eventId, party.eventId))).toMatchObject([{ gameId: null, setAt: null }])
    expect(await testDb.db.select().from(vetoes)).toHaveLength(1)
  })
})
