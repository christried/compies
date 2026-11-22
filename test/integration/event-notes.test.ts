import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { eventGameNotes, games, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { Db } from '../../server/utils/db'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { EventNotesSaved } from '../../shared/event'
import { EVENT_NOTES_MAX } from '../../shared/event'
import { GAME_NOTES_MAX } from '../../shared/game'
import { notesFromLines, type NotesDoc } from '../../shared/notes-doc'
import { createTestApp, errorOf, sendVia } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, hostFinishes, hostEntersResult, hostPutsBack, hostSets, playersJoin, readEvent, signInAs, startRunningEvent, type Rig } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// The Host's Event notes, the server side (#731, spec #717 § E, ADR 0019): one document per Event and game, written by the Host through `changeEvent`, read only
// in the Host's Event read. What no Member, feed entry or room message carries is in event-notes-secrecy.test.ts.

const host = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const players = {
  one: { provider: 'discord', id: '2', name: 'Eins', email: 'one@example.com', image: undefined },
  two: { provider: 'discord', id: '3', name: 'Zwei', email: 'two@example.com', image: undefined },
} as const
const coHost = { provider: 'discord', id: '6', name: 'Mitgastgeber', email: 'cohost@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '7', name: 'Anderer', email: 'other@example.com', image: undefined } as const

const T0 = '2090-10-30T10:00:00.000Z'
const T1 = '2090-10-30T10:05:00.000Z'
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

const doc = (text: string): NotesDoc => notesFromLines([text])!

/** The parts of a response a client can tell apart, body text included. */
async function answer(response: Response) {
  return { status: response.status, statusText: response.statusText, body: await response.text() }
}

describe('Event notes, the Host\'s server side (#731)', () => {
  let client: PGlite
  let counted: Db
  let rig: Rig
  const log: string[] = []
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)

  beforeAll(async () => {
    const testDb = await createTestDb()
    client = testDb.client
    // The same database with a logger, for the statement count of the Host's read.
    counted = drizzle({ client, schema, logger: { logQuery: (query: string) => void log.push(query) } }) as unknown as Db
    rig = { request: createTestApp(counted, { roomNotifier: notifier, clock }), db: counted, clock, notifier }
  })

  afterAll(async () => {
    await client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    await resetDatabase(counted)
  })

  afterEach(() => vi.unstubAllEnvs())

  const send = sendVia(() => rig.request)

  /** A running Event with one Game in the pool (`halo`), one in the library only (`kart`) and a Player in team 1. */
  async function running(settings: Record<string, unknown> = {}) {
    const ev = await startRunningEvent(rig, {
      host,
      players,
      seats: [['one', 1], ['two', 2]],
      settings: { gameCount: 1, pointsTable: { preset: 'linear', values: [1, 0] }, selectionMode: 'lucky_wheel', vetoAllowance: 1, ...settings },
      games: [
        { key: 'halo', values: { name: 'Halo' }, pool: true },
        { key: 'kart', values: { name: 'Kart' }, pool: false },
      ],
    })
    return { ...ev, hostCookie: ev.host.cookie, one: ev.players.one.cookie }
  }

  type Party = Awaited<ReturnType<typeof running>>

  const put = (party: { slug: string }, gameId: string, cookie: string | undefined, notes?: unknown) =>
    send('PUT', `/api/e/${party.slug}/games/${gameId}/notes`, cookie, notes === undefined ? {} : { notes })
  const rows = (party: { eventId: string }) => counted.select().from(eventGameNotes).where(eq(eventGameNotes.eventId, party.eventId))
  const hostRead = async (party: Party) => (await readEvent(rig, party.hostCookie, party.slug)).eventNotes
  const saved = async (response: Response) => {
    expect(response.status).toBe(200)
    return await response.json() as EventNotesSaved
  }

  describe('saving', () => {
    it('stores a document and answers it with the game', async () => {
      const party = await running()

      const body = await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Erst die Regeln')))

      expect(body).toEqual({ gameId: party.games.halo.id, notes: doc('Erst die Regeln') })
      expect(await rows(party)).toMatchObject([{ eventId: party.eventId, gameId: party.games.halo.id, notes: doc('Erst die Regeln') }])
    })

    it('replaces the document in the same row: one row, updatedAt the clock\'s now, createdAt kept', async () => {
      const party = await running()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Alt')))
      const [first] = await rows(party)
      clock.set(T1)

      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Neu')))

      const after = await rows(party)
      expect(after).toHaveLength(1)
      expect(after[0]).toMatchObject({ notes: doc('Neu') })
      expect(after[0]!.updatedAt.toISOString()).toBe(T1)
      expect(after[0]!.createdAt).toEqual(first!.createdAt)
    })

    it.each([
      ['null', null],
      ['an empty string', ''],
      ['a document with no visible text', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] }],
    ])('clears the note with %s: the row and its key are gone', async (_name, cleared) => {
      const party = await running()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Weg damit')))
      expect(Object.keys((await hostRead(party))!)).toEqual([party.games.halo.id])

      expect(await saved(await put(party, party.games.halo.id, party.hostCookie, cleared))).toEqual({ gameId: party.games.halo.id, notes: null })

      expect(await rows(party)).toEqual([])
      expect(await hostRead(party)).toEqual({})
    })

    it('clears a note that is not there: 200, nothing stored', async () => {
      const party = await running()

      expect(await saved(await put(party, party.games.halo.id, party.hostCookie, null))).toEqual({ gameId: party.games.halo.id, notes: null })
      expect(await rows(party)).toEqual([])
    })

    it('takes a 2000-character note and 2000 emoji, and refuses 2001 characters', async () => {
      const party = await running()
      const longest = notesFromLines(['x'.repeat(EVENT_NOTES_MAX)])!
      const emoji = notesFromLines(['😀'.repeat(EVENT_NOTES_MAX)])!

      expect((await saved(await put(party, party.games.halo.id, party.hostCookie, longest))).notes).toEqual(longest)
      expect((await saved(await put(party, party.games.kart.id, party.hostCookie, emoji))).notes).toEqual(emoji)
      expect(((await hostRead(party))![party.games.kart.id])).toEqual(emoji)

      const refused = await put(party, party.games.halo.id, party.hostCookie, notesFromLines(['x'.repeat(EVENT_NOTES_MAX + 1)]))
      expect(await errorOf(refused)).toEqual({ status: 400, code: 'invalid_game_notes' })
      expect((await rows(party)).find(row => row.gameId === party.games.halo.id)?.notes).toEqual(longest)
    })

    it('takes a note for an Archived game of the Host\'s library (#467: archived or not)', async () => {
      const party = await running()
      await counted.update(games).set({ archivedAt: new Date(T0) }).where(eq(games.id, party.games.kart.id))

      await saved(await put(party, party.games.kart.id, party.hostCookie, doc('Archiviert')))

      expect(await hostRead(party)).toEqual({ [party.games.kart.id]: doc('Archiviert') })
    })

    it('works with an upper-case game id and stores it lower-case', async () => {
      const party = await running()

      await saved(await put(party, party.games.halo.id.toUpperCase(), party.hostCookie, doc('Gross')))

      expect(await rows(party)).toMatchObject([{ gameId: party.games.halo.id }])
    })

    it('keeps two independent notes for one game in two Events of one Host', async () => {
      const first = await running()
      const second = await hostCreatesEvent(rig, first.host, { sessions: 1, slots: ['2090-11-30T20:30'], settings: { format: 'teams', teamCount: 2, teamSize: 3, gameCount: 10, pointsTable: { preset: 'linear', values: [1, 0] }, selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null } })
      await saved(await put(first, first.games.halo.id, first.hostCookie, doc('Erster')))

      await saved(await put(second, first.games.halo.id, first.hostCookie, doc('Zweiter')))
      await saved(await put(second, first.games.halo.id, first.hostCookie, null))

      expect(await rows(first)).toMatchObject([{ notes: doc('Erster') }])
      expect(await rows(second)).toEqual([])
    })
  })

  describe('the Host\'s read', () => {
    it('is a map by game id of every row: none, one, two; a pool game, a library-only game and a game the Host set directly all appear', async () => {
      const party = await running()
      expect(await hostRead(party)).toEqual({})

      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Pool')))
      expect(await hostRead(party)).toEqual({ [party.games.halo.id]: doc('Pool') })

      // Kart is in the library only; the Host sets it directly, and its note is the same kind of row.
      await hostSets(rig, party, party.games.kart.id)
      await saved(await put(party, party.games.kart.id, party.hostCookie, doc('Gesetzt')))
      expect(await hostRead(party)).toEqual({ [party.games.halo.id]: doc('Pool'), [party.games.kart.id]: doc('Gesetzt') })
    })

    it('holds a library-only game\'s note without the game being in the pool or set', async () => {
      const party = await running()

      await saved(await put(party, party.games.kart.id, party.hostCookie, doc('Nur Bibliothek')))

      expect(await hostRead(party)).toEqual({ [party.games.kart.id]: doc('Nur Bibliothek') })
    })

    it('stays when the game leaves the pool, and after its Round is put back', async () => {
      const party = await running()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Bleibt')))
      const round = await hostSets(rig, party, party.games.halo.id)

      const left = await send('PATCH', `/api/e/${party.slug}/settings`, party.hostCookie, { pool: [party.games.kart.id] })
      expect(left.status).toBe(200)
      expect(await hostRead(party)).toEqual({ [party.games.halo.id]: doc('Bleibt') })

      await hostPutsBack(rig, party, round)
      expect(await rows(party)).toMatchObject([{ gameId: party.games.halo.id, notes: doc('Bleibt') }])
      expect(await hostRead(party)).toEqual({ [party.games.halo.id]: doc('Bleibt') })
    })

    it('runs exactly one select on event_game_notes for the Host and none for a Member', async () => {
      const party = await running()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Eins')))
      const notesSelects = () => log.filter(statement => /^select/i.test(statement) && /from "event_game_notes"/.test(statement)).length

      log.length = 0
      expect((await send('GET', `/api/e/${party.slug}`, party.hostCookie)).status).toBe(200)
      expect(notesSelects()).toBe(1)

      log.length = 0
      expect((await send('GET', `/api/e/${party.slug}`, party.one)).status).toBe(200)
      expect(notesSelects()).toBe(0)
    })

    it('is null for a Member, whatever the notes are', async () => {
      const party = await running()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Geheim')))

      expect((await readEvent(rig, party.one, party.slug)).eventNotes).toBeNull()
    })
  })

  describe('refusals', () => {
    it.each([
      ['an unknown node', { type: 'doc', content: [{ type: 'image' }] }],
      ['a heading of another level', { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Zu gross' }] }] }],
      ['a javascript: link', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Klick', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }],
      ['a plain string', 'Nur Text'],
    ])('refuses %s with invalid_game_notes and changes nothing', async (_name, notes) => {
      const party = await running()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Bleibt')))

      expect(await errorOf(await put(party, party.games.halo.id, party.hostCookie, notes))).toEqual({ status: 400, code: 'invalid_game_notes' })

      expect(await rows(party)).toMatchObject([{ notes: doc('Bleibt') }])
    })

    it('refuses a body without the notes key with invalid_value, and never clears with it', async () => {
      const party = await running()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Bleibt')))

      expect(await errorOf(await put(party, party.games.halo.id, party.hostCookie))).toEqual({ status: 400, code: 'invalid_value' })

      expect(await rows(party)).toMatchObject([{ notes: doc('Bleibt') }])
    })

    it('refuses an id that is no uuid with invalid_value', async () => {
      const party = await running()

      expect(await errorOf(await put(party, 'halo', party.hostCookie, doc('Nein')))).toEqual({ status: 400, code: 'invalid_value' })
      expect(await rows(party)).toEqual([])
    })

    it('refuses a Player and a second Host who joined as a Member with not_host, before the body is looked at', async () => {
      const party = await running()
      setAllowlist({ hosts: 'discord:1,discord:6,discord:7' })
      const member = await signInAs(rig, coHost)
      await playersJoin(rig, party, [member])

      for (const cookie of [party.one, member.cookie]) {
        expect(await errorOf(await put(party, party.games.halo.id, cookie, doc('Nein')))).toEqual({ status: 403, code: 'not_host' })
        expect(await errorOf(await put(party, party.games.halo.id, cookie, { type: 'doc', content: [{ type: 'image' }] }))).toEqual({ status: 403, code: 'not_host' })
      }
      expect(await rows(party)).toEqual([])
    })

    it('answers another Host who is no Member as an unknown slug, and a signed-out request with 401', async () => {
      const party = await running()
      setAllowlist({ hosts: 'discord:1,discord:6,discord:7' })
      const stranger = await signInAs(rig, otherHost)

      const outsider = await answer(await put(party, party.games.halo.id, stranger.cookie, doc('Nein')))
      const unknown = await answer(await put({ slug: 'gibt-es-nicht' }, party.games.halo.id, stranger.cookie, doc('Nein')))

      expect(outsider.status).toBe(404)
      expect(outsider).toEqual(unknown)
      expect((await put(party, party.games.halo.id, undefined, doc('Nein'))).status).toBe(401)
      expect(await rows(party)).toEqual([])
    })

    it('answers another Host\'s game exactly as a uuid no game has, and writes nothing', async () => {
      const party = await running()
      setAllowlist({ hosts: 'discord:1,discord:6,discord:7' })
      const stranger = await signInAs(rig, otherHost)
      const [foreign] = await counted.insert(games).values({ name: 'Fremdes Spiel', createdBy: stranger.id }).returning()

      const theirs = await answer(await put(party, foreign!.id, party.hostCookie, doc('Nein')))
      const none = await answer(await put(party, UNKNOWN_ID, party.hostCookie, doc('Nein')))

      expect(theirs.status).toBe(400)
      expect(JSON.parse(theirs.body)).toMatchObject({ statusMessage: 'unknown_game' })
      expect(theirs).toEqual(none)
      expect(await rows(party)).toEqual([])
    })
  })

  describe('a finished Event', () => {
    async function finished() {
      const party = await running()
      const round = await hostSets(rig, party, party.games.halo.id)
      await hostEntersResult(rig, party, round, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      return party
    }

    it('refuses a save with wrong_phase and leaves the row; the Host\'s read still carries the map, a Member\'s is null', async () => {
      const party = await finished()
      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Vorher')))
      await hostFinishes(rig, party, { outcome: 'winner', winners: [1] })

      expect(await errorOf(await put(party, party.games.halo.id, party.hostCookie, doc('Nachher')))).toEqual({ status: 409, code: 'wrong_phase' })
      expect(await errorOf(await put(party, party.games.halo.id, party.hostCookie, null))).toEqual({ status: 409, code: 'wrong_phase' })

      expect(await rows(party)).toMatchObject([{ notes: doc('Vorher') }])
      const view = await readEvent(rig, party.hostCookie, party.slug)
      expect(view.event.phase).toBe('finished')
      expect(view.eventNotes).toEqual({ [party.games.halo.id]: doc('Vorher') })
      expect((await readEvent(rig, party.one, party.slug)).eventNotes).toBeNull()
    })
  })

  // The Game notes in the same request (#835, spec #856): the Host's game dialog saves both documents of a game in one go. `notes` keeps its meaning, `gameNotes` is the
  // game's own notes in the library (`games.notes`); a key that is absent stays as it is.
  describe('with the Game notes (#835)', () => {
    const sendNotes = (party: { slug: string }, gameId: string, cookie: string | undefined, body: Record<string, unknown>) =>
      send('PUT', `/api/e/${party.slug}/games/${gameId}/notes`, cookie, body)
    const gameNotesOf = async (gameId: string) => (await counted.select().from(games).where(eq(games.id, gameId)))[0]!.notes
    const gameRow = async (gameId: string) => (await counted.select().from(games).where(eq(games.id, gameId)))[0]!
    const blank = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] }

    it('stores both in one request and answers both; games.updatedAt is the clock\'s now', async () => {
      const party = await running()
      clock.set(T1)

      const body = await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Fürs Event'), gameNotes: doc('Fürs Spiel') }))

      expect(body).toEqual({ gameId: party.games.halo.id, notes: doc('Fürs Event'), gameNotes: doc('Fürs Spiel') })
      expect(await rows(party)).toMatchObject([{ gameId: party.games.halo.id, notes: doc('Fürs Event') }])
      const row = await gameRow(party.games.halo.id)
      expect(row.notes).toEqual(doc('Fürs Spiel'))
      expect(row.updatedAt.toISOString()).toBe(T1)
    })

    it('takes the Game notes alone: the Event notes row stays, the answer has no notes key; the Event notes alone leave games.notes', async () => {
      const party = await running()
      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event alt'), gameNotes: doc('Spiel alt') }))

      const gameOnly = await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: doc('Spiel neu') }))
      expect(gameOnly).toEqual({ gameId: party.games.halo.id, gameNotes: doc('Spiel neu') })
      expect(Object.hasOwn(gameOnly, 'notes')).toBe(false)
      expect(await rows(party)).toMatchObject([{ notes: doc('Event alt') }])

      const eventOnly = await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event neu') }))
      expect(eventOnly).toEqual({ gameId: party.games.halo.id, notes: doc('Event neu') })
      expect(Object.hasOwn(eventOnly, 'gameNotes')).toBe(false)
      expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Spiel neu'))
    })

    it.each([
      ['null', null],
      ['an empty string', ''],
      ['a document with no visible text', blank],
    ])('clears the Game notes with %s', async (_name, cleared) => {
      const party = await running()
      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event bleibt'), gameNotes: doc('Weg damit') }))

      expect(await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: cleared }))).toEqual({ gameId: party.games.halo.id, gameNotes: null })

      expect(await gameNotesOf(party.games.halo.id)).toBeNull()
      expect(await rows(party)).toMatchObject([{ notes: doc('Event bleibt') }])
    })

    it('never clears a note whose key is absent: set both, send only the other', async () => {
      const party = await running()
      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event'), gameNotes: doc('Spiel') }))

      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: null }))
      expect(await rows(party)).toEqual([])
      expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Spiel'))

      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event') }))
      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: null }))
      expect(await rows(party)).toMatchObject([{ notes: doc('Event') }])
      expect(await gameNotesOf(party.games.halo.id)).toBeNull()
    })

    describe('a refused note refuses both', () => {
      const refusals: [string, unknown][] = [
        ['an unknown node', { type: 'doc', content: [{ type: 'image' }] }],
        ['a heading of another level', { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Zu gross' }] }] }],
        ['a javascript: link', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Klick', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }],
        ['a plain string', 'Nur Text'],
        ['2001 characters', notesFromLines(['x'.repeat(GAME_NOTES_MAX + 1)])],
      ]

      it.each(refusals)('%s in the Game field with a valid Event field: both stay as they were', async (_name, refused) => {
        const party = await running()
        await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event bleibt'), gameNotes: doc('Spiel bleibt') }))

        expect(await errorOf(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event neu'), gameNotes: refused }))).toEqual({ status: 400, code: 'invalid_game_notes' })

        expect(await rows(party)).toMatchObject([{ notes: doc('Event bleibt') }])
        expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Spiel bleibt'))
      })

      it.each(refusals.slice(0, 4).concat([['2001 characters', notesFromLines(['x'.repeat(EVENT_NOTES_MAX + 1)])]]))('%s in the Event field with a valid Game field: both stay as they were', async (_name, refused) => {
        const party = await running()
        await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event bleibt'), gameNotes: doc('Spiel bleibt') }))

        expect(await errorOf(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: refused, gameNotes: doc('Spiel neu') }))).toEqual({ status: 400, code: 'invalid_game_notes' })

        expect(await rows(party)).toMatchObject([{ notes: doc('Event bleibt') }])
        expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Spiel bleibt'))
      })
    })

    it('takes 2000 characters and 2000 emoji in the Game notes and refuses 2001', async () => {
      const party = await running()
      const longest = notesFromLines(['x'.repeat(GAME_NOTES_MAX)])!
      const emoji = notesFromLines(['😀'.repeat(GAME_NOTES_MAX)])!

      expect((await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: longest }))).gameNotes).toEqual(longest)
      expect((await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: emoji }))).gameNotes).toEqual(emoji)
      expect(await gameNotesOf(party.games.halo.id)).toEqual(emoji)

      expect(await errorOf(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: notesFromLines(['x'.repeat(GAME_NOTES_MAX + 1)]) }))).toEqual({ status: 400, code: 'invalid_game_notes' })
      expect(await gameNotesOf(party.games.halo.id)).toEqual(emoji)
    })

    it('refuses a body with neither key with invalid_value and changes nothing', async () => {
      const party = await running()
      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { notes: doc('Event bleibt'), gameNotes: doc('Spiel bleibt') }))

      expect(await errorOf(await sendNotes(party, party.games.halo.id, party.hostCookie, {}))).toEqual({ status: 400, code: 'invalid_value' })

      expect(await rows(party)).toMatchObject([{ notes: doc('Event bleibt') }])
      expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Spiel bleibt'))
    })

    it('takes the Host\'s own games only: another Host\'s game and an unknown uuid answer alike, and not even the Event field is written', async () => {
      const party = await running()
      setAllowlist({ hosts: 'discord:1,discord:6,discord:7' })
      const stranger = await signInAs(rig, otherHost)
      const [foreign] = await counted.insert(games).values({ name: 'Fremdes Spiel', createdBy: stranger.id }).returning()

      const theirs = await answer(await sendNotes(party, foreign!.id, party.hostCookie, { notes: doc('Nein'), gameNotes: doc('Nein') }))
      const none = await answer(await sendNotes(party, UNKNOWN_ID, party.hostCookie, { notes: doc('Nein'), gameNotes: doc('Nein') }))

      expect(theirs.status).toBe(400)
      expect(JSON.parse(theirs.body)).toMatchObject({ statusMessage: 'unknown_game' })
      expect(theirs).toEqual(none)
      expect(await rows(party)).toEqual([])
      expect(await gameNotesOf(foreign!.id)).toBeNull()
    })

    it('refuses a Player and a second Member with not_host before the body is looked at, another Host as an unknown slug, and a signed-out request with 401; games.notes stays', async () => {
      const party = await running()
      setAllowlist({ hosts: 'discord:1,discord:6,discord:7' })
      const member = await signInAs(rig, coHost)
      await playersJoin(rig, party, [member])
      const stranger = await signInAs(rig, otherHost)
      const body = { gameNotes: doc('Nein') }

      for (const cookie of [party.one, member.cookie]) {
        expect(await errorOf(await sendNotes(party, party.games.halo.id, cookie, body))).toEqual({ status: 403, code: 'not_host' })
        expect(await errorOf(await sendNotes(party, party.games.halo.id, cookie, { gameNotes: { type: 'doc', content: [{ type: 'image' }] } }))).toEqual({ status: 403, code: 'not_host' })
      }
      expect((await sendNotes(party, party.games.halo.id, stranger.cookie, body)).status).toBe(404)
      expect((await sendNotes(party, party.games.halo.id, undefined, body)).status).toBe(401)
      expect(await gameNotesOf(party.games.halo.id)).toBeNull()
    })

    it('does not ask for the Host permission: a Host who lost it saves, while the library\'s own save refuses the same User', async () => {
      const party = await running()
      setAllowlist({ hosts: '' })
      await counted.update(users).set({ canHost: false }).where(eq(users.id, party.host.id))

      const body = await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: doc('Ohne Erlaubnis') }))

      expect(body.gameNotes).toEqual(doc('Ohne Erlaubnis'))
      expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Ohne Erlaubnis'))
      expect((await send('PATCH', `/api/games/${party.games.halo.id}`, party.hostCookie, { name: 'Halo', notes: doc('Anders') })).status).toBe(404)
      expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Ohne Erlaubnis'))
    })

    it('saves an Archived game\'s Game notes like any other\'s', async () => {
      const party = await running()
      await counted.update(games).set({ archivedAt: new Date(T0) }).where(eq(games.id, party.games.kart.id))

      await saved(await sendNotes(party, party.games.kart.id, party.hostCookie, { gameNotes: doc('Archiviert') }))

      expect(await gameNotesOf(party.games.kart.id)).toEqual(doc('Archiviert'))
    })

    it('shows the new Game notes in the Host\'s read: the dialog\'s facts, the pool and the open Round, which the Round card and the popovers read', async () => {
      const party = await running()
      await hostSets(rig, party, party.games.halo.id)

      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: doc('Frisch') }))

      const view = await readEvent(rig, party.hostCookie, party.slug)
      expect(view.hostGames![party.games.halo.id]!.notes).toEqual(doc('Frisch'))
      const poolGame = view.pool!.find(game => game.id === party.games.halo.id)
      expect(poolGame).toMatchObject({ notes: doc('Frisch') })
      expect(view.rounds.map(round => round.notes)).toEqual([doc('Frisch')])
    })

    it('tells the room once, and the Host alone', async () => {
      const party = await running()
      notifier.clear()

      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: doc('Laut') }))

      expect(notifier.messages(party.eventId).map(message => message.type)).toEqual(['event.changed'])
      expect(notifier.sends(party.eventId).map(sent => sent.to)).toEqual([[party.host.id]])
    })

    it('leaves a finished Event as it is in this ticket: a Game-only save is wrong_phase and changes nothing (0.19-2, #857, changes this)', async () => {
      const party = await running()
      const round = await hostSets(rig, party, party.games.halo.id)
      await hostEntersResult(rig, party, round, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
      await saved(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: doc('Vorher') }))
      await hostFinishes(rig, party, { outcome: 'winner', winners: [1] })

      expect(await errorOf(await sendNotes(party, party.games.halo.id, party.hostCookie, { gameNotes: doc('Nachher') }))).toEqual({ status: 409, code: 'wrong_phase' })

      expect(await gameNotesOf(party.games.halo.id)).toEqual(doc('Vorher'))
    })
  })

  describe('the change it makes in the room', () => {
    it('is the usual event.changed, once per save', async () => {
      const party = await running()
      notifier.clear()

      await saved(await put(party, party.games.halo.id, party.hostCookie, doc('Laut')))

      expect(notifier.messages(party.eventId).map(message => message.type)).toEqual(['event.changed'])
    })
  })
})
