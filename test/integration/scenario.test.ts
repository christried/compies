import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { draws, games } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { GameList } from '../../shared/game'
import { createTestApp, errorOf, sendVia } from './app'
import { createTestDb, resetDatabase } from './harness'
import {
  clockToEnd, clockToStop, hostCreatesEvent, hostEndsSession, hostEntersResult, hostFinishes, hostPutsBack, hostSets, hostSignsIn, hostSpins,
  playersJoin, playerVetoes, readEvent, readFeed, signInAs, startRunningEvent, startRunningSession, type GameSeed, type Signed, type Stage,
} from './scenario'
import { stubAuthEnv } from './sign-in'

// The Event scenario module (#418 part B): glossary verbs over the HTTP surface, which the integration tests use in place of their
// local `running()` builders. Each case reads the result the way a User or the API does: responses and the Event read.
const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com' } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com' },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com' },
} as const
const outsider = { provider: 'twitch', id: '8', name: 'Fremder', email: 'outsider@example.com' } as const

describe('the Event scenario', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let stage: Stage
  const notifier = memoryRoomNotifier()
  const clock = testClock('2090-10-30T10:00:00.000Z')

  beforeAll(async () => {
    testDb = await createTestDb()
    stage = { request: createTestApp(testDb.db, { roomNotifier: notifier, clock }), db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set('2090-10-30T10:00:00.000Z')
    notifier.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const send = sendVia(() => stage.request)
  const base = { host, players, seats: [['one', 1], ['two', 2]], settings: { teamSize: 1 } } as const

  describe('startRunningEvent', () => {
    it('starts a Session of two teams of one Player: the Host reads a running Event, and an outsider is no Member until the invite joins them', async () => {
      const ev = await startRunningEvent(stage, { ...base, outsiders: { outsider } })

      const view = await readEvent(stage, ev.host.cookie, ev.slug)
      expect(view.event.phase).toBe('running')
      expect(view.runningSessionId).not.toBeNull()
      expect(view.members.filter(member => member.team === 1).map(member => member.id)).toEqual([ev.players.one.id])
      expect(view.members.filter(member => member.team === 2).map(member => member.id)).toEqual([ev.players.two.id])

      expect(await errorOf(await send('GET', `/api/e/${ev.slug}`, ev.outsiders.outsider.cookie))).toEqual({ status: 404, code: 'Event not found' })
      await playersJoin(stage, ev, [ev.outsiders.outsider])
      expect((await readEvent(stage, ev.outsiders.outsider.cookie, ev.slug)).members.map(member => member.id)).toContain(ev.outsiders.outsider.id)
    })

    it('seats a Player on the Stands, and leaves a Player who is not listed on the Bench', async () => {
      const three = { provider: 'twitch', id: '4', name: 'Drei', email: 'three@example.com' } as const
      const cast = { ...base, players: { ...players, three } }
      const zoneOf = async (ev: { host: Signed, slug: string }, id: string) => (await readEvent(stage, ev.host.cookie, ev.slug)).members.find(member => member.id === id)

      const onStands = await startRunningEvent(stage, { ...cast, seats: [['one', 1], ['two', 2], ['three', 'stands']] })
      expect(await zoneOf(onStands, onStands.players.three.id)).toMatchObject({ zone: 'stands', team: null })

      await resetDatabase(testDb.db)
      const onBench = await startRunningEvent(stage, { ...cast, seats: [['one', 1], ['two', 2]] })
      expect(await zoneOf(onBench, onBench.players.three.id)).toMatchObject({ zone: 'bench', team: null })
    })
  })

  describe('the options', () => {
    it('confirmed: 1 of 2 leaves one Slot undated', async () => {
      const ev = await startRunningEvent(stage, { ...base, confirmed: 1 })

      expect((await readEvent(stage, ev.host.cookie, ev.slug)).missingDates).toBe(1)
    })

    it('start: false leaves no Running Session, with the Dates set', async () => {
      const ev = await startRunningEvent(stage, { ...base, start: false })

      const view = await readEvent(stage, ev.host.cookie, ev.slug)
      expect(view.runningSessionId).toBeNull()
      expect(view.missingDates).toBe(0)
    })

    it('join: rows writes no member_joined entry, join: invite writes one for every Player', async () => {
      const byRows = await startRunningEvent(stage, { ...base, quiet: false })
      expect((await readFeed(stage, byRows.host.cookie, byRows.slug)).map(entry => entry.type)).not.toContain('member_joined')

      await resetDatabase(testDb.db)
      const byInvite = await startRunningEvent(stage, { ...base, join: 'invite', quiet: false })
      expect((await readFeed(stage, byInvite.host.cookie, byInvite.slug)).filter(entry => entry.type === 'member_joined')).toHaveLength(2)
    })

    it('quiet: room-and-feed leaves the feed and the room empty, room only the room, false neither', async () => {
      const silent = await startRunningEvent(stage, { ...base, quiet: 'room-and-feed' })
      expect(await readFeed(stage, silent.host.cookie, silent.slug)).toEqual([])
      expect(notifier.messages(silent.eventId)).toEqual([])

      await resetDatabase(testDb.db)
      const roomOnly = await startRunningEvent(stage, base)
      expect((await readFeed(stage, roomOnly.host.cookie, roomOnly.slug)).length).toBeGreaterThan(0)
      expect(notifier.messages(roomOnly.eventId)).toEqual([])

      await resetDatabase(testDb.db)
      const loud = await startRunningEvent(stage, { ...base, quiet: false })
      expect((await readFeed(stage, loud.host.cookie, loud.slug)).length).toBeGreaterThan(0)
      expect(notifier.messages(loud.eventId).length).toBeGreaterThan(0)
    })
  })

  describe('a Lucky Wheel Event', () => {
    const wheel = { ...base, settings: { teamSize: 1, selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 1 } } as const
    const pool = (names: string[]) => names.map(name => ({ key: name, values: { name }, pool: true }) satisfies GameSeed)

    it('hides the drawn game from a Player until the stop, and shows the Vetoes to the other Party from the end of the window', async () => {
      const ev = await startRunningEvent(stage, { ...wheel, games: pool(['Halo', 'Kart', 'Dart']) })

      const { drawId } = await hostSpins(stage, ev)

      const [row] = await stage.db.select().from(draws).where(eq(draws.id, drawId))
      expect(row).toBeDefined()
      expect((await readEvent(stage, ev.players.one.cookie, ev.slug)).wheel?.spin?.game).toBeNull()
      await clockToStop(stage, drawId)
      expect((await readEvent(stage, ev.players.one.cookie, ev.slug)).wheel?.spin?.game?.id).toBe(row!.gameId)

      await playerVetoes(stage, ev, drawId, ev.players.one)
      await clockToEnd(stage, drawId)
      expect((await readEvent(stage, ev.players.two.cookie, ev.slug)).wheel?.vetoes.revealed).toEqual([{ team: 1 }])
    })

    it('throws a clock verb that has no clock on the stage', async () => {
      const ev = await startRunningEvent(stage, { ...wheel, games: pool(['Halo', 'Kart']) })
      const { drawId } = await hostSpins(stage, ev)

      await expect(clockToStop({ ...stage, clock: undefined }, drawId)).rejects.toThrow('no clock')
    })
  })

  describe('during the Session', () => {
    it('sets a game, puts it back, enters a Result and finishes the Event', async () => {
      const ev = await startRunningEvent(stage, { ...base, settings: { teamSize: 1, gameCount: 1 }, games: [{ key: 'halo', values: { name: 'Halo' }, pool: true }] })

      const first = await hostSets(stage.request, ev.slug, ev.host.cookie, ev.games.halo.id)
      await hostPutsBack(stage.request, ev.slug, ev.host.cookie, first)
      const second = await hostSets(stage.request, ev.slug, ev.host.cookie, ev.games.halo.id)
      expect(await hostEntersResult(stage, ev, second, [{ team: 1, place: 1 }, { team: 2, place: 2 }])).toEqual({ roundId: second, number: 1 })
      expect(await hostFinishes(stage, ev, { outcome: 'winner', winners: [1] })).toMatchObject({ phase: 'finished', winners: [1] })

      expect((await readEvent(stage, ev.host.cookie, ev.slug)).event.phase).toBe('finished')
    })

    it('ends the Running Session', async () => {
      const ev = await startRunningEvent(stage, base)

      await hostEndsSession(stage, ev)

      expect((await readEvent(stage, ev.host.cookie, ev.slug)).runningSessionId).toBeNull()
    })
  })

  describe('GameSeed', () => {
    it('puts a pool game in the Host\'s pool, and a library-only game in the library alone', async () => {
      const ev = await startRunningEvent(stage, {
        ...base,
        games: [{ key: 'halo', values: { name: 'Halo', notes: 'Hausregel' }, pool: true }, { key: 'schach', values: { name: 'Schach' }, pool: false }],
      })

      expect((await readEvent(stage, ev.host.cookie, ev.slug)).pool?.map(game => game.name)).toEqual(['Halo'])
      const library = await (await send('GET', '/api/games', ev.host.cookie)).json() as GameList
      expect(library.games.map(game => game.name).sort()).toEqual(['Halo', 'Schach'])
      expect(ev.games.schach.createdBy).toBe(ev.host.id)
    })
  })

  describe('the verbs of the older builders', () => {
    it('keep their signatures: startRunningSession, hostSets and hostPutsBack on a request, a slug and a cookie', async () => {
      const hostSigned = await hostSignsIn(stage, host)
      const one = await signInAs(stage, players.one)
      const two = await signInAs(stage, players.two)
      const created = await hostCreatesEvent(stage, hostSigned, { sessions: 1, slots: ['2090-10-30T20:30'] })
      await playersJoin(stage, created, [one, two])
      const [halo] = await stage.db.insert(games).values({ name: 'Halo', createdBy: hostSigned.id }).returning()

      await startRunningSession(stage.request, stage.db, { slug: created.slug, hostCookie: hostSigned.cookie, seated: [{ cookie: one.cookie, email: players.one.email }, { cookie: two.cookie, email: players.two.email }] })
      const roundId = await hostSets(stage.request, created.slug, hostSigned.cookie, halo!.id)
      expect((await readEvent(stage, hostSigned.cookie, created.slug)).rounds).toHaveLength(1)
      await hostPutsBack(stage.request, created.slug, hostSigned.cookie, roundId)

      expect((await readEvent(stage, hostSigned.cookie, created.slug)).rounds).toEqual([])
    })
  })
})
