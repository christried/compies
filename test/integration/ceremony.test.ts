import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getActivity from '../../server/api/e/[slug]/activity.get'
import startCeremony from '../../server/api/e/[slug]/ceremony.post'
import createEvent from '../../server/api/e/index.post'
import readEvent from '../../server/api/e/[slug].get'
import { activity, eventMembers, events, games, roundPlaces, rounds, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { ActivityPage } from '../../shared/activity'
import type { EventView } from '../../shared/event'
import type { CeremonyStarted } from '../../shared/stage'
import { CEREMONY_LEAD_MS } from '../../shared/ceremony'
import { withTeams } from '../../shared/settings'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The platform's random source with an override the gag tests set: otherwise it is the real one (the pattern of hidden-wheel.test.ts).
const source = vi.hoisted(() => ({ override: null as ((n: number) => number) | null, asked: [] as number[] }))
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  const randomInt = ((...args: unknown[]) => {
    if (source.override && args.length === 1) {
      source.asked.push(args[0] as number)
      return source.override(args[0] as number)
    }
    return (real.randomInt as (...a: unknown[]) => unknown)(...args)
  }) as typeof real.randomInt
  return { ...real, default: { ...real, randomInt }, randomInt }
})

// Starting the Award ceremony (#309, spec #308): the Host of a finished Event starts it through the HTTP API with a test clock and the
// in-memory room. The server stamps the start (the request's clock plus the lead) and picks the gag; the Event read carries the same
// `ceremony` for every Member, and the room hears `event.changed` only. The rules are unit-tested in ceremony.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const

const SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
const T0 = '2090-10-30T10:00:00.000Z'
const T0_MS = Date.parse(T0)
const STARTS = T0_MS + CEREMONY_LEAD_MS
// endMs of the table in the brief: 2 Parties 5050 (trip) / 6450 (bonk), 3 Parties 5500 / 6900, with one Winner. A Tie of 2 of 4 Parties
// (#315: 2 rows, a hop, the plate) ends at 6660 / 8060, both of 2 Parties at 5760 / 7160 (no rows).
const END_MS = { 2: { trip: 5050, bonk: 6450 }, 3: { trip: 5500, bonk: 6900 } } as const
const TIE_END_MS = { twoOfFour: { trip: 6660, bonk: 8060 }, twoOfTwo: { trip: 5760, bonk: 7160 } } as const

describe('starting the Award ceremony (#309)', () => {
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
      'POST /api/e/:slug/ceremony': startCeremony,
    }, { roomNotifier: notifier, clock })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    source.override = null
    source.asked = []
    await testDb.db.delete(activity)
    await testDb.db.delete(roundPlaces)
    await testDb.db.delete(rounds)
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
   * The Results a finished Event stands on (the Standings, and so the Winner count, are computed from them, #315): `sole`, team 1 wins
   * every Round; `tie`, teams 1 and 2 swap first and second place, so they end level on rank 1; `none` has no Result, which makes every
   * Party a Winner (nobody has a point, so every Party shares rank 1). The other teams follow in order.
   */
  async function seedResults(eventId: string, outcome: 'sole' | 'tie' | 'none', teamCount: number) {
    if (outcome === 'none') return
    const [hostRow] = await testDb.db.select({ id: users.id }).from(users).where(eq(users.email, host.email))
    const [game] = await testDb.db.insert(games).values({ name: 'Halo', createdBy: hostRow!.id }).returning({ id: games.id })
    const rest = Array.from({ length: teamCount - 2 }, (_, index) => index + 3)
    const orders = outcome === 'sole' ? [[1, 2, ...rest]] : [[1, 2, ...rest], [2, 1, ...rest]]
    const inserted = await testDb.db.insert(rounds).values(orders.map((_, index) => ({
      eventId, gameId: game!.id, startedAt: new Date(T0), setAt: new Date(T0), number: index + 1, resultAt: new Date(T0),
    }))).returning({ id: rounds.id, number: rounds.number })
    await testDb.db.insert(roundPlaces).values(inserted.flatMap(({ id, number }) => orders[number! - 1]!.map((team, index) => ({ roundId: id, team, place: index + 1 }))))
  }

  /**
   * An Event with a Host and two Members, set to Phase `finished` straight in the database (the finish flow is finish.test.ts's), with
   * `teamCount` Parties; both ceremony columns stay null, as an Event finished on 0.8 has them. `finished: false` leaves it in its poll Phase.
   */
  async function event({ finished = true, teamCount = 2, outcome = 'sole' }: { finished?: boolean, teamCount?: number, outcome?: 'sole' | 'tie' | 'none' } = {}) {
    setAllowlist({ hosts: 'discord:1' })
    const hostCookie = (await signIn(testDb.db, host)).cookie
    const cookies = {
      one: (await signIn(testDb.db, players.one)).cookie,
      two: (await signIn(testDb.db, players.two)).cookie,
    }
    const created = await send('POST', '/api/e', hostCookie, { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 2, slots: SLOTS, settings: withTeams(TEST_SETTINGS, teamCount, 3) })
    const { slug } = await created.json() as { slug: string }
    const [eventRow] = await testDb.db.select().from(events).where(eq(events.slug, slug))
    for (const profile of [players.one, players.two]) {
      const [row] = await testDb.db.select().from(users).where(eq(users.email, profile.email))
      await testDb.db.insert(eventMembers).values({ eventId: eventRow!.id, userId: row!.id })
    }
    if (finished) {
      await seedResults(eventRow!.id, outcome, teamCount)
      await testDb.db.update(events).set({ phase: 'finished', finishedAt: clock.now() }).where(eq(events.id, eventRow!.id))
    }
    notifier.clear()
    return { slug, eventId: eventRow!.id, hostCookie, cookies }
  }

  type Event = Awaited<ReturnType<typeof event>>

  const start = (game: Event, cookie = game.hostCookie) => send('POST', `/api/e/${game.slug}/ceremony`, cookie)
  const readCeremony = async (game: Event, cookie = game.hostCookie) => (await (await send('GET', `/api/e/${game.slug}`, cookie)).json() as EventView).ceremony
  const lengthOf = async (game: Event) => {
    const ceremony = (await readCeremony(game))!
    return Date.parse(ceremony.endsAt) - Date.parse(ceremony.startsAt)
  }
  const rowOf = async (game: Event) => (await testDb.db.select({ startsAt: events.ceremonyStartsAt, gag: events.ceremonyGag }).from(events).where(eq(events.id, game.eventId)))[0]
  const feedOf = async (game: Event) => (await (await send('GET', `/api/e/${game.slug}/activity?limit=100`, game.hostCookie)).json() as ActivityPage).entries
  const activityRows = async () => (await testDb.db.select().from(activity)).length

  describe('the refusals', () => {
    it('refuses a Player, who is not the Host, with not_host', async () => {
      const game = await event()

      expect(await errorOf(await start(game, game.cookies.one))).toEqual({ status: 403, code: 'not_host' })
      expect(await rowOf(game)).toEqual({ startsAt: null, gag: null })
    })

    it('refuses an Event that is not finished with wrong_phase', async () => {
      const game = await event({ finished: false })

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'wrong_phase' })
      expect(await rowOf(game)).toEqual({ startsAt: null, gag: null })
    })

    it('refuses a second start during the run with ceremony_running, one millisecond before its end, and takes one exactly at its end', async () => {
      const game = await event()
      source.override = () => 0
      await start(game)
      const endsAt = STARTS + END_MS[2].trip

      clock.set(new Date(endsAt - 1))
      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'ceremony_running' })

      clock.set(new Date(endsAt))
      expect((await start(game)).status).toBe(200)
    })

    it('refuses a double tap in the lead, before the first run has begun', async () => {
      const game = await event()
      await start(game)

      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'ceremony_running' })
    })
  })

  describe('the start and its gag', () => {
    it('answers the start 1.5 s after the commit and the end of the run for 2 Parties, and stores the start and the gag', async () => {
      const game = await event()
      source.override = () => 0

      const response = await start(game)

      expect(response.status).toBe(200)
      expect(await response.json() as CeremonyStarted).toEqual({
        startsAt: new Date(STARTS).toISOString(),
        endsAt: new Date(STARTS + END_MS[2].trip).toISOString(),
        gag: 'trip',
      })
      expect(await rowOf(game)).toEqual({ startsAt: new Date(STARTS), gag: 'trip' })
    })

    it('ends the run later with 3 Parties and the bonk gag', async () => {
      const game = await event({ teamCount: 3 })
      source.override = () => 1

      const body = await (await start(game)).json() as CeremonyStarted

      expect(body).toEqual({ startsAt: new Date(STARTS).toISOString(), endsAt: new Date(STARTS + END_MS[3].bonk).toISOString(), gag: 'bonk' })
    })

    for (const [pick, gag] of [[0, 'trip'], [1, 'bonk']] as const) {
      it(`takes the gag from the random source on the first start, asking it once with 2 (${pick} is ${gag})`, async () => {
        const game = await event()
        source.override = () => pick

        expect(((await (await start(game)).json()) as CeremonyStarted).gag).toBe(gag)
        expect(source.asked).toEqual([2])
      })
    }

    it('takes the other gag on a second start without asking the source, and a restart overwrites both columns', async () => {
      const game = await event()
      source.override = () => 0
      await start(game)
      source.asked = []
      clock.set(new Date(STARTS + END_MS[2].trip + 10_000))

      const second = await (await start(game)).json() as CeremonyStarted

      expect(second.gag).toBe('bonk')
      expect(source.asked).toEqual([])
      expect(await rowOf(game)).toEqual({ startsAt: new Date(STARTS + END_MS[2].trip + 10_000 + CEREMONY_LEAD_MS), gag: 'bonk' })

      clock.set(new Date(STARTS + END_MS[2].trip + 10_000 + CEREMONY_LEAD_MS + END_MS[2].bonk))
      expect(((await (await start(game)).json()) as CeremonyStarted).gag).toBe('trip')
    })

    it('ends the run of a Tie of 2 of 4 Parties later than a sole Winner\'s, in the answer and in the read (#315)', async () => {
      const game = await event({ teamCount: 4, outcome: 'tie' })
      source.override = () => 0

      const body = await (await start(game)).json() as CeremonyStarted

      expect(body.endsAt).toBe(new Date(STARTS + TIE_END_MS.twoOfFour.trip).toISOString())
      expect(await lengthOf(game)).toBe(TIE_END_MS.twoOfFour.trip)
    })

    it('has no rows when both of 2 Parties won: a Tie of 2 of 2, with the bonk gag (#315)', async () => {
      const game = await event({ teamCount: 2, outcome: 'none' })
      source.override = () => 1

      await start(game)

      expect(await lengthOf(game)).toBe(TIE_END_MS.twoOfTwo.bonk)
    })

    it('keeps a single Winner\'s end of the same Party count unchanged (#315)', async () => {
      const game = await event({ teamCount: 4 })
      source.override = () => 0

      await start(game)

      expect(await lengthOf(game)).toBe(5950)
    })

    it('refuses a second start of a Tie one millisecond before its end and takes one exactly at it (#315)', async () => {
      const game = await event({ teamCount: 4, outcome: 'tie' })
      source.override = () => 0
      await start(game)
      const endsAt = STARTS + TIE_END_MS.twoOfFour.trip

      clock.set(new Date(endsAt - 1))
      expect(await errorOf(await start(game))).toEqual({ status: 409, code: 'ceremony_running' })

      clock.set(new Date(endsAt))
      expect((await start(game)).status).toBe(200)
    })

    it('starts an Event that finished before the migration, with both columns null', async () => {
      const game = await event()
      expect(await rowOf(game)).toEqual({ startsAt: null, gag: null })

      expect((await start(game)).status).toBe(200)
    })
  })

  describe('what the Members get', () => {
    it('reads `ceremony` as null before the first start, for the Host and a Player', async () => {
      const game = await event()

      expect(await readCeremony(game)).toBeNull()
      expect(await readCeremony(game, game.cookies.one)).toBeNull()
    })

    it('reads the same `ceremony` for the Host and a Player after a start', async () => {
      const game = await event()
      source.override = () => 1
      await start(game)

      const forHost = await readCeremony(game)
      expect(forHost).toEqual({ startsAt: new Date(STARTS).toISOString(), endsAt: new Date(STARTS + END_MS[2].bonk).toISOString(), gag: 'bonk' })
      expect(await readCeremony(game, game.cookies.one)).toEqual(forHost)
    })

    it('reads `ceremony` as null for an Event that is not finished', async () => {
      const game = await event({ finished: false })

      expect(await readCeremony(game)).toBeNull()
    })

    it('tells the room only that the Event changed, and writes no Activity entry', async () => {
      const game = await event()
      const before = await activityRows()
      const entries = await feedOf(game)

      await start(game)

      expect(notifier.messages(game.eventId).map(message => message.type)).toEqual(['event.changed'])
      expect(await activityRows()).toBe(before)
      expect(await feedOf(game)).toEqual(entries)
    })
  })
})
