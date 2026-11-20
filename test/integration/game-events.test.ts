import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { eventPoolGames, events, games, rounds } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { Db } from '../../server/utils/db'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { GameEvents } from '../../shared/game-events'
import { notesFromLines, type NotesDoc } from '../../shared/notes-doc'
import { createTestApp, errorOf, sendVia } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, hostEntersResult, hostFinishes, hostPutsBack, hostSets, playersJoin, signInAs, startRunningSession, type Rig, type Signed } from './scenario'
import { TEST_SETTINGS } from './fixtures'
import { setAllowlist, stubAuthEnv } from './sign-in'

// The Events of a game on its page (#656, spec #717 § F): `GET /api/games/:id/events` lists the Events of the game's User whose pool holds the game
// (#843: an Event that only played it makes no row), newest first, with the Host's Event notes for it. Every name and id is invented.

const profile = (id: string, name: string) => ({ provider: 'discord', id, name, email: `${name.toLowerCase()}@example.com`, image: undefined }) as const
const hostProfile = profile('1', 'Hostess')
const playerProfiles = [profile('2', 'Eins'), profile('3', 'Zwei')] as const
const memberProfile = profile('4', 'Gast')
const otherHostProfile = profile('7', 'Anderer')
const adminProfile = profile('9', 'Admin')

const T0 = '2090-10-30T10:00:00.000Z'
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

const doc = (text: string): NotesDoc => notesFromLines([text])!

describe('the Events of a game (#656)', () => {
  let client: PGlite
  let counted: Db
  let rig: Rig
  const log: string[] = []
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)
  let host: Signed
  let otherHost: Signed
  let players: Signed[]
  let member: Signed
  let admin: Signed

  beforeAll(async () => {
    const testDb = await createTestDb()
    client = testDb.client
    // The same database with a logger, for the statement count of the read.
    counted = drizzle({ client, schema, logger: { logQuery: (query: string) => void log.push(query) } }) as unknown as Db
    rig = { request: createTestApp(counted, { roomNotifier: notifier, clock }), db: counted, clock, notifier }
  })

  afterAll(async () => {
    await client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ hosts: 'discord:1,discord:7', admins: 'discord:9' })
    clock.set(T0)
    notifier.clear()
    await resetDatabase(counted)
    host = await signInAs(rig, hostProfile)
    otherHost = await signInAs(rig, otherHostProfile)
    players = [await signInAs(rig, playerProfiles[0]), await signInAs(rig, playerProfiles[1])]
    member = await signInAs(rig, memberProfile)
    admin = await signInAs(rig, adminProfile)
  })

  afterEach(() => vi.unstubAllEnvs())

  const send = sendVia(() => rig.request)

  /** A game of the library of `owner` (the Host by default). */
  async function newGame(name: string, owner: Signed = host) {
    const [row] = await counted.insert(games).values({ name, createdBy: owner.id }).returning()
    return row!
  }

  /** An Event of the Host in its poll, with `pool` as its Game pool; `created` sets its creation instant straight, so the order does not rest on the database clock. */
  async function newEvent(name: string, { pool = [], created, by = host, settings }: { pool?: string[], created?: string, by?: Signed, settings?: Record<string, unknown> } = {}) {
    const ev = await hostCreatesEvent(rig, by, { name, pool, ...(settings ? { settings: { ...TEST_SETTINGS, ...settings } } : {}) })
    if (created) await counted.update(events).set({ createdAt: new Date(created) }).where(eq(events.id, ev.eventId))
    return { ...ev, host: by }
  }
  type Party = Awaited<ReturnType<typeof newEvent>>

  /** Starts the Event's Session with the two Players seated, so a game can be set and given a Result. */
  async function startSession(ev: Party) {
    await playersJoin(rig, ev, players)
    await startRunningSession(rig, ev, players)
  }

  /** The Host sets the game in the running Event; with `result`, enters a Result for the Round. Answers the Round's id. */
  async function play(ev: Party, gameId: string, { result = true } = {}) {
    const roundId = await hostSets(rig, ev, gameId)
    if (result) await hostEntersResult(rig, ev, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    return roundId
  }

  const read = (gameId: string, viewer: Signed | null = host) => send('GET', `/api/games/${gameId}/events`, viewer?.cookie)
  const eventsOf = async (gameId: string) => {
    const response = await read(gameId)
    expect(response.status).toBe(200)
    return (await response.json() as GameEvents).events
  }

  it('lists an Event that holds the game in its pool and never played it: played 0, no notes', async () => {
    const halo = await newGame('Halo')
    const party = await newEvent('Freitag', { pool: [halo.id] })

    expect(await eventsOf(halo.id)).toEqual([{ slug: party.slug, name: 'Freitag', played: 0, notes: null }])
  })

  it('lists nothing for a game that is in no pool and in no Round', async () => {
    const halo = await newGame('Halo')
    await newEvent('Freitag')

    expect(await eventsOf(halo.id)).toEqual([])
  })

  describe('played', () => {
    it('counts a game given a Result in an Event whose pool holds it, and leaves out an Event that played it outside its pool (#843)', async () => {
      const halo = await newGame('Halo')
      const inPool = await newEvent('Mit Pool', { pool: [halo.id] })
      const direct = await newEvent('Direkt gesetzt')
      await startSession(inPool)
      await play(inPool, halo.id)
      await startSession(direct)
      await play(direct, halo.id)

      const listed = await eventsOf(halo.id)

      expect(listed.map(({ name, played }) => ({ name, played }))).toEqual([{ name: 'Mit Pool', played: 1 }])
    })

    it('counts 3 Rounds with a Result as 3', async () => {
      const halo = await newGame('Halo')
      const party = await newEvent('Dreimal', { pool: [halo.id] })
      // The API never allows it (game_already_drawn refuses a second set of a taken game), so the Rounds go straight into the table.
      await counted.insert(rounds).values([1, 2, 3].map(number => ({
        eventId: party.eventId, gameId: halo.id, number, startedAt: new Date(T0), setAt: new Date(T0), resultAt: new Date(T0),
      })))

      expect(await eventsOf(halo.id)).toMatchObject([{ slug: party.slug, played: 3 }])
    })

    it('does not count a put-back Round: no row when the game is in no pool, a row with 0 when it is', async () => {
      const halo = await newGame('Halo')
      const bare = await newEvent('Ohne Pool')
      const pooled = await newEvent('Mit Pool', { pool: [halo.id] })
      await startSession(bare)
      await hostPutsBack(rig, bare, await play(bare, halo.id, { result: false }))
      await startSession(pooled)
      await hostPutsBack(rig, pooled, await play(pooled, halo.id, { result: false }))

      expect(await eventsOf(halo.id)).toMatchObject([{ slug: pooled.slug, played: 0 }])
    })

    it('counts the scored Round only when one was scored and one put back in the same Event', async () => {
      const halo = await newGame('Halo')
      const party = await newEvent('Eins von zwei', { pool: [halo.id] })
      await startSession(party)
      await hostPutsBack(rig, party, await play(party, halo.id, { result: false }))
      await play(party, halo.id)

      expect(await eventsOf(halo.id)).toMatchObject([{ slug: party.slug, played: 1 }])
    })

    it('makes no row for a Round that is set and waits for its Result when the game is in no pool', async () => {
      const halo = await newGame('Halo')
      const party = await newEvent('Wartet')
      await startSession(party)
      await play(party, halo.id, { result: false })

      expect(await eventsOf(halo.id)).toEqual([])
    })

    it('lists a finished Event whose pool holds the game and that played it', async () => {
      const halo = await newGame('Halo')
      const party = await newEvent('Vorbei', { pool: [halo.id], settings: { gameCount: 1, teamCount: 2, teamSize: 1 } })
      await startSession(party)
      await play(party, halo.id)
      await hostFinishes(rig, party, { outcome: 'winner', winners: [1] })

      expect(await eventsOf(halo.id)).toMatchObject([{ slug: party.slug, name: 'Vorbei', played: 1 }])
    })
  })

  describe('which Events never show', () => {
    it('leaves out a deleted Event, also one with a Result and notes', async () => {
      const halo = await newGame('Halo')
      const gone = await newEvent('Gelöscht', { pool: [halo.id] })
      const played = await newEvent('Gespielt und gelöscht', { pool: [halo.id] })
      const kept = await newEvent('Bleibt', { pool: [halo.id] })
      expect((await send('PUT', `/api/e/${gone.slug}/games/${halo.id}/notes`, host.cookie, { notes: doc('Weg') })).status).toBe(200)
      // The delete route refuses a running Event, so the one with a Result is marked deleted straight.
      await startSession(played)
      await play(played, halo.id)
      expect((await send('PUT', `/api/e/${played.slug}/games/${halo.id}/notes`, host.cookie, { notes: doc('Auch weg') })).status).toBe(200)
      await counted.update(events).set({ deletedAt: new Date(T0) }).where(eq(events.id, played.eventId))
      expect((await send('DELETE', `/api/e/${gone.slug}`, host.cookie)).status).toBe(200)

      const listed = await eventsOf(halo.id)

      expect(listed.map(row => row.slug)).toEqual([kept.slug])
      expect(JSON.stringify(listed)).not.toContain('weg')
    })

    it('leaves out an Event of another Host that names the game (rows no API can make, inserted straight)', async () => {
      const halo = await newGame('Halo')
      const foreign = await newEvent('Fremd', { by: otherHost })
      await counted.insert(eventPoolGames).values({ eventId: foreign.eventId, gameId: halo.id })
      await counted.insert(rounds).values({ eventId: foreign.eventId, gameId: halo.id, number: 1, startedAt: new Date(T0), setAt: new Date(T0), resultAt: new Date(T0) })
      const own = await newEvent('Eigen', { pool: [halo.id] })

      expect((await eventsOf(halo.id)).map(row => row.slug)).toEqual([own.slug])
    })

    it('lists only the Events of the game asked for', async () => {
      const halo = await newGame('Halo')
      const kart = await newGame('Kart')
      const first = await newEvent('Erster', { pool: [halo.id] })
      const second = await newEvent('Zweiter', { pool: [kart.id] })

      expect((await eventsOf(halo.id)).map(row => row.slug)).toEqual([first.slug])
      expect((await eventsOf(kart.id)).map(row => row.slug)).toEqual([second.slug])
    })
  })

  it('still lists the Events of an Archived game', async () => {
    const halo = await newGame('Halo')
    const party = await newEvent('Freitag', { pool: [halo.id] })
    expect((await send('PUT', `/api/games/${halo.id}/archived`, host.cookie, { archived: true })).status).toBe(200)

    expect((await eventsOf(halo.id)).map(row => row.slug)).toEqual([party.slug])
  })

  describe('order', () => {
    it('is newest first by the Event\'s creation', async () => {
      const halo = await newGame('Halo')
      const middle = await newEvent('Mitte', { pool: [halo.id], created: '2090-02-01T10:00:00.000Z' })
      const newest = await newEvent('Neu', { pool: [halo.id], created: '2090-03-01T10:00:00.000Z' })
      const oldest = await newEvent('Alt', { pool: [halo.id], created: '2090-01-01T10:00:00.000Z' })

      expect((await eventsOf(halo.id)).map(row => row.slug)).toEqual([newest.slug, middle.slug, oldest.slug])
    })

    it('breaks a tie of the creation instant by id, descending', async () => {
      const halo = await newGame('Halo')
      const one = await newEvent('Gleich A', { pool: [halo.id], created: '2090-02-01T10:00:00.000Z' })
      const two = await newEvent('Gleich B', { pool: [halo.id], created: '2090-02-01T10:00:00.000Z' })
      const expected = [one, two].sort((a, b) => (a.eventId < b.eventId ? 1 : -1)).map(row => row.slug)

      expect((await eventsOf(halo.id)).map(row => row.slug)).toEqual(expected)
    })
  })

  describe('Event notes', () => {
    const write = async (party: Party, gameId: string, notes: NotesDoc | null) =>
      expect((await send('PUT', `/api/e/${party.slug}/games/${gameId}/notes`, host.cookie, { notes })).status).toBe(200)

    it('shows a note in its own Event\'s row only', async () => {
      const halo = await newGame('Halo')
      const first = await newEvent('Erster', { pool: [halo.id], created: '2090-01-01T10:00:00.000Z' })
      const second = await newEvent('Zweiter', { pool: [halo.id], created: '2090-02-01T10:00:00.000Z' })
      await write(first, halo.id, doc('Nur im ersten'))

      expect(await eventsOf(halo.id)).toEqual([
        { slug: second.slug, name: 'Zweiter', played: 0, notes: null },
        { slug: first.slug, name: 'Erster', played: 0, notes: doc('Nur im ersten') },
      ])
    })

    it('makes no row once the game left the pool, also when it was played there (#843); the note stays stored and shows when the game is back', async () => {
      const halo = await newGame('Halo')
      const kart = await newGame('Kart')
      const party = await newEvent('Freitag', { pool: [halo.id, kart.id] })
      await startSession(party)
      await write(party, halo.id, doc('Bleibt'))
      await write(party, kart.id, doc('Verwaist'))
      await play(party, halo.id)
      expect((await send('PATCH', `/api/e/${party.slug}/settings`, host.cookie, { pool: [] })).status).toBe(200)

      expect(await eventsOf(halo.id)).toEqual([])
      expect(await eventsOf(kart.id)).toEqual([])

      expect((await send('PATCH', `/api/e/${party.slug}/settings`, host.cookie, { pool: [halo.id] })).status).toBe(200)
      expect(await eventsOf(halo.id)).toEqual([{ slug: party.slug, name: 'Freitag', played: 1, notes: doc('Bleibt') }])
    })

    it('has no note in the row once the Host cleared it', async () => {
      const halo = await newGame('Halo')
      const party = await newEvent('Freitag', { pool: [halo.id] })
      await write(party, halo.id, doc('Erst da'))
      await write(party, halo.id, null)

      expect(await eventsOf(halo.id)).toMatchObject([{ slug: party.slug, notes: null }])
    })
  })

  it('runs the same number of statements at 1 and at 3 Events', async () => {
    const halo = await newGame('Halo')
    const countFor = async () => {
      log.length = 0
      await eventsOf(halo.id)
      return log.length
    }
    await newEvent('Erster', { pool: [halo.id] })
    const one = await countFor()
    await newEvent('Zweiter', { pool: [halo.id] })
    await newEvent('Dritter', { pool: [halo.id] })

    expect(await countFor()).toBe(one)
    // Three at most for the read itself, after the viewer lookup (session, user) and the game lookup.
    const reads = log.filter(statement => /from "(event_pool_games|rounds|events)"/.test(statement))
    expect(reads.length).toBeLessThanOrEqual(3)
  })

  describe('who may', () => {
    it('answers 404 to everyone but the owner on a game with Event notes, with the notes\' text in no body', async () => {
      const halo = await newGame('Halo')
      const party = await newEvent('Freitag', { pool: [halo.id] })
      expect((await send('PUT', `/api/e/${party.slug}/games/${halo.id}/notes`, host.cookie, { notes: doc('Geheimer Plan') })).status).toBe(200)

      // The Platform admin is a Host by the allowlist and has a library of its own, but this game is not in it.
      for (const viewer of [null, member, otherHost, admin]) {
        const response = await read(halo.id, viewer)
        const body = await response.text()
        expect(response.status, viewer?.profile.name ?? 'signed out').toBe(404)
        expect(body).not.toContain('Geheimer Plan')
      }
    })

    it('answers 404 for an unknown id and for text that is no uuid', async () => {
      expect((await read(UNKNOWN_ID)).status).toBe(404)
      expect(await errorOf(await read('kein-uuid'))).toMatchObject({ status: 404 })
    })

    it('keeps the Events and their notes out of GET /api/games and GET /api/games/:id', async () => {
      const halo = await newGame('Halo')
      const party = await newEvent('Freitag', { pool: [halo.id] })
      expect((await send('PUT', `/api/e/${party.slug}/games/${halo.id}/notes`, host.cookie, { notes: doc('Geheimer Plan') })).status).toBe(200)

      for (const path of ['/api/games', `/api/games/${halo.id}`]) {
        const body = await (await send('GET', path, host.cookie)).text()
        expect(body, path).not.toContain('Geheimer Plan')
        expect(body, path).not.toContain('"events"')
        expect(body, path).not.toContain('Freitag')
      }
    })
  })
})
