import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { authAccounts, eventPoolGames, events, games, rounds } from '../../server/db/schema'
import type { Db } from '../../server/utils/db'
import type { Phase } from '../../shared/phase'
import type { GameList, GameView } from '../../shared/game'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

// „in 2 Events“ on the library card (#733, spec #717 F2): GET /api/games answers, per game, in how many of the viewer's
// Events that have not finished (and are not deleted) the game sits in the Game pool. One grouped statement.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '3', name: 'Zweiter', email: 'host2@example.com', image: undefined } as const

describe('the live Event count of the library (#733)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let counted: Db
  let request: TestRequest
  let hostCookie: string
  let hostId: string
  let otherId: string
  const log: string[] = []
  let sequence = 0

  beforeAll(async () => {
    testDb = await createTestDb()
    // The same database, with a logger: the statements of a request are counted from it.
    const logger = {
      logQuery(query: string) {
        log.push(query)
      },
    }
    counted = drizzle({ client: testDb.client, schema, logger }) as unknown as Db
    request = createTestApp(counted)
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:3', admins: 'discord:9' })
    await resetDatabase(counted)
    hostCookie = (await signIn(counted, host)).cookie
    await signIn(counted, otherHost)
    hostId = await userId(host.id)
    otherId = await userId(otherHost.id)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function userId(discordId: string) {
    const [row] = await counted.select({ id: authAccounts.userId }).from(authAccounts).where(and(eq(authAccounts.providerId, 'discord'), eq(authAccounts.accountId, discordId)))
    return row!.id
  }

  async function newGame(name: string, createdBy = hostId, archived = false) {
    const [row] = await counted.insert(games).values({ name, createdBy, archivedAt: archived ? new Date() : null }).returning()
    return row!
  }

  // An Event row inserted directly, with the games in its pool.
  async function newEvent(pool: { id: string }[], phase: Phase = 'draft', extra: { hostId?: string, deletedAt?: Date } = {}) {
    sequence += 1
    const [row] = await counted.insert(events).values({
      slug: `ev-${sequence}`,
      inviteToken: `token-${sequence}`,
      hostId: extra.hostId ?? hostId,
      name: `Event ${sequence}`,
      phase,
      deletedAt: extra.deletedAt ?? null,
    }).returning()
    if (pool.length) await counted.insert(eventPoolGames).values(pool.map(game => ({ eventId: row!.id, gameId: game.id })))
    return row!
  }

  // A Round inserted directly (#900). Without `resultAt` it is a Round that was set and has no Result; `putBack` makes it one that was put back (no Result: the
  // `rounds_result_stands_check` forbids a Result and a put back together). With `resultAt` it takes `number` (unique per Event) and may carry a Correction.
  async function newRound(eventId: string, gameId: string, extra: { resultAt?: Date, number?: number, putBack?: boolean, corrected?: Date } = {}) {
    const setAt = new Date('2090-01-01T10:00:00.000Z')
    const [row] = await counted.insert(rounds).values({
      eventId,
      gameId,
      startedAt: setAt,
      setAt,
      putBackAt: extra.putBack ? new Date('2090-01-01T10:05:00.000Z') : null,
      resultAt: extra.resultAt ?? null,
      number: extra.resultAt ? (extra.number ?? 1) : null,
      correctedAt: extra.corrected ?? null,
    }).returning()
    return row!
  }

  async function list(cookie = hostCookie) {
    const response = await request('/api/games', { headers: { cookie } })
    expect(response.status).toBe(200)
    return await response.json() as GameList
  }

  describe('the count', () => {
    it('has no key for a game in no pool, and answers an empty object for an empty library', async () => {
      expect((await list()).eventCounts).toEqual({})
      const kart = await newGame('Mario Kart')
      await newEvent([])

      expect((await list()).eventCounts).toEqual({})
      expect((await list()).games.map((game: GameView) => game.id)).toEqual([kart.id])
    })

    it('counts a game in one Event 1 and in two Events 2, as numbers', async () => {
      const kart = await newGame('Mario Kart')
      await newEvent([kart])

      const one = (await list()).eventCounts
      expect(one).toEqual({ [kart.id]: 1 })
      expect(typeof one[kart.id]).toBe('number')

      await newEvent([kart])
      const two = (await list()).eventCounts
      expect(two).toEqual({ [kart.id]: 2 })
      expect(typeof two[kart.id]).toBe('number')
    })

    it('counts an Event in each Phase before it finishes', async () => {
      const kart = await newGame('Mario Kart')
      for (const phase of ['draft', 'poll', 'date_set', 'running'] as const) await newEvent([kart], phase)

      expect((await list()).eventCounts).toEqual({ [kart.id]: 4 })
    })

    it('gives each game its own count', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')
      await newGame('Tetris')
      await newEvent([kart, pong])
      await newEvent([kart])

      expect((await list()).eventCounts).toEqual({ [kart.id]: 2, [pong.id]: 1 })
    })

    it('counts an archived game like any other, since its pool rows stay', async () => {
      const old = await newGame('Altes Spiel', hostId, true)
      await newEvent([old], 'poll')

      expect((await list()).eventCounts).toEqual({ [old.id]: 1 })
    })
  })

  describe('what is not counted', () => {
    it('leaves out a finished Event and a deleted one', async () => {
      const kart = await newGame('Mario Kart')
      await newEvent([kart], 'finished')
      await newEvent([kart], 'poll', { deletedAt: new Date() })

      expect((await list()).eventCounts).toEqual({})
    })

    it('counts only the live one of a game that is in a live and a finished Event', async () => {
      const kart = await newGame('Mario Kart')
      await newEvent([kart], 'running')
      await newEvent([kart], 'finished')

      expect((await list()).eventCounts).toEqual({ [kart.id]: 1 })
    })

    it('leaves out an Event of another Host that holds the viewer\'s game (a foreign pool row, ADR 0018)', async () => {
      const kart = await newGame('Mario Kart')
      await newEvent([kart], 'poll', { hostId: otherId })

      expect((await list()).eventCounts).toEqual({})
    })

    it('shows the other Host nothing of the first Host\'s Events', async () => {
      const kart = await newGame('Mario Kart')
      await newEvent([kart])
      const otherCookie = (await signIn(counted, otherHost)).cookie

      expect(await list(otherCookie)).toEqual({ games: [], tagsInUse: [], eventCounts: {}, lastPlayed: {} })
    })
  })

  describe('the last played day (#900)', () => {
    const early = new Date('2090-03-04T17:41:23.456Z')
    const late = new Date('2090-05-06T08:09:10.111Z')

    it('has no key for a game never played, and {} for an empty library or a game in a pool with no Round', async () => {
      expect((await list()).lastPlayed).toEqual({})
      const kart = await newGame('Mario Kart')
      await newEvent([kart], 'running')

      expect((await list()).lastPlayed).toEqual({})
    })

    it('gives a played game a key whose value is the Result\'s instant as a UTC ISO string', async () => {
      const kart = await newGame('Mario Kart')
      const ev = await newEvent([kart], 'running')
      await newRound(ev.id, kart.id, { resultAt: early })

      const { lastPlayed } = await list()
      expect(typeof lastPlayed[kart.id]).toBe('string')
      expect(lastPlayed).toEqual({ [kart.id]: early.toISOString() })
    })

    it('takes the latest Result, in two Events and in one Event, in either order of insertion', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')
      const first = await newEvent([kart], 'finished')
      const second = await newEvent([kart], 'running')
      await newRound(second.id, kart.id, { resultAt: late })
      await newRound(first.id, kart.id, { resultAt: early })
      const same = await newEvent([pong], 'running')
      await newRound(same.id, pong.id, { resultAt: early, number: 1 })
      await newRound(same.id, pong.id, { resultAt: late, number: 2 })
      const reversed = await newGame('Tetris')
      const other = await newEvent([reversed], 'running')
      await newRound(other.id, reversed.id, { resultAt: late, number: 1 })
      await newRound(other.id, reversed.id, { resultAt: early, number: 2 })

      expect((await list()).lastPlayed).toEqual({
        [kart.id]: late.toISOString(),
        [pong.id]: late.toISOString(),
        [reversed.id]: late.toISOString(),
      })
    })

    it('is not moved by a Correction, which keeps the Result\'s instant', async () => {
      const kart = await newGame('Mario Kart')
      const ev = await newEvent([kart], 'running')
      await newRound(ev.id, kart.id, { resultAt: early, corrected: late })

      expect((await list()).lastPlayed).toEqual({ [kart.id]: early.toISOString() })
    })

    it('gives no key for a Round without a Result or a Round put back, and keeps an older Result of another Event', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')
      const ev = await newEvent([kart, pong], 'running')
      await newRound(ev.id, kart.id)
      await newRound(ev.id, pong.id, { putBack: true })
      expect((await list()).lastPlayed).toEqual({})

      const older = await newEvent([kart], 'finished')
      await newRound(older.id, kart.id, { resultAt: early })
      expect((await list()).lastPlayed).toEqual({ [kart.id]: early.toISOString() })
    })

    it('leaves out the Result of a deleted Event, and falls back to the older one of another Event', async () => {
      const kart = await newGame('Mario Kart')
      const gone = await newEvent([kart], 'finished', { deletedAt: new Date() })
      await newRound(gone.id, kart.id, { resultAt: late })
      expect((await list()).lastPlayed).toEqual({})

      const kept = await newEvent([kart], 'finished')
      await newRound(kept.id, kart.id, { resultAt: early })
      expect((await list()).lastPlayed).toEqual({ [kart.id]: early.toISOString() })
    })

    it('counts a finished, a running and a draft Event', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')
      const tetris = await newGame('Tetris')
      for (const [phase, game] of [['finished', kart], ['running', pong], ['draft', tetris]] as const) {
        const ev = await newEvent([game], phase)
        await newRound(ev.id, game.id, { resultAt: early })
      }

      expect((await list()).lastPlayed).toEqual({
        [kart.id]: early.toISOString(),
        [pong.id]: early.toISOString(),
        [tetris.id]: early.toISOString(),
      })
    })

    it('never counts an Event of another Host that holds the viewer\'s game (a foreign pool row, ADR 0018)', async () => {
      const kart = await newGame('Mario Kart')
      const foreign = await newEvent([kart], 'running', { hostId: otherId })
      await newRound(foreign.id, kart.id, { resultAt: early })

      expect((await list()).lastPlayed).toEqual({})
    })

    it('shows the other Host nothing of the first Host\'s Results', async () => {
      const kart = await newGame('Mario Kart')
      const mine = await newEvent([kart], 'running')
      await newRound(mine.id, kart.id, { resultAt: late })
      const otherCookie = (await signIn(counted, otherHost)).cookie
      expect(await list(otherCookie)).toEqual({ games: [], tagsInUse: [], eventCounts: {}, lastPlayed: {} })
    })

    it('counts a game played outside the pool and an archived game', async () => {
      const kart = await newGame('Mario Kart')
      const old = await newGame('Altes Spiel', hostId, true)
      const ev = await newEvent([], 'running')
      await newRound(ev.id, kart.id, { resultAt: early, number: 1 })
      await newRound(ev.id, old.id, { resultAt: late, number: 2 })

      expect((await list()).lastPlayed).toEqual({ [kart.id]: early.toISOString(), [old.id]: late.toISOString() })
    })

    it('gives each game its own date: three games, two played', async () => {
      const kart = await newGame('Mario Kart')
      const pong = await newGame('Pong')
      await newGame('Tetris')
      const ev = await newEvent([kart, pong], 'running')
      await newRound(ev.id, kart.id, { resultAt: early, number: 1 })
      await newRound(ev.id, pong.id, { resultAt: late, number: 2 })

      expect((await list()).lastPlayed).toEqual({ [kart.id]: early.toISOString(), [pong.id]: late.toISOString() })
    })
  })

  describe('who may ask', () => {
    it('still answers as for a missing route to a Member and to a signed-out request', async () => {
      const kart = await newGame('Mario Kart')
      await newEvent([kart])
      const memberCookie = (await signIn(counted, member)).cookie

      for (const headers of [{ cookie: memberCookie }, {}] as Record<string, string>[]) {
        const response = await request('/api/games', { headers })
        expect(response.status).toBe(404)
        const body = await response.text()
        expect(body).not.toContain('eventCounts')
        expect(body).not.toContain('lastPlayed')
      }
    })
  })

  describe('the statements', () => {
    // The statements one GET /api/games logged, as the delta around the request: the sign-in's own reads are in it, so only
    // the equality and the one grouped count over the pool rows are pinned, not a total.
    async function statementsOfList() {
      const before = log.length
      await list()
      return log.slice(before)
    }

    it('are the same for 1 game in 1 Event and for 6 games in 3 Events, with one grouped count over the pool rows and one grouped read over the Rounds (#900)', async () => {
      const first = await newGame('Spiel 0')
      const firstEvent = await newEvent([first])
      await newRound(firstEvent.id, first.id, { resultAt: new Date('2090-03-04T17:41:23.456Z') })
      const small = await statementsOfList()

      const more = await Promise.all([1, 2, 3, 4, 5].map(n => newGame(`Spiel ${n}`)))
      const second = await newEvent([first, ...more.slice(0, 2)])
      const third = await newEvent(more.slice(2))
      await newRound(second.id, more[0]!.id, { resultAt: new Date('2090-03-05T17:41:23.456Z') })
      await newRound(third.id, more[3]!.id, { resultAt: new Date('2090-03-06T17:41:23.456Z') })
      const large = await statementsOfList()

      expect(large).toHaveLength(small.length)
      for (const statements of [small, large]) {
        expect(statements.filter(sql => sql.includes('"event_pool_games"'))).toHaveLength(1)
        expect(statements.filter(sql => sql.includes('"rounds"'))).toHaveLength(1)
      }
    })
  })
})
