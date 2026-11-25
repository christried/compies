import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventGameNotes, eventMembers, eventPoolGames, events, gameTags, games, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { AccountDeleted } from '../../shared/auth'
import type { ArchiveView } from '../../shared/archive'
import type { GameTag } from '../../shared/game'
import type { HomeView } from '../../shared/event'
import type { NotesDoc } from '../../shared/notes-doc'
import { webpOf } from '../webp-fixtures'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { clockToStop, hostEntersResult, hostFinishes, hostSets, hostSignsIn, hostSpins, playerVetoes, setUpEvent, startRunningEvent, type Rig, type Signed } from './scenario'
import { stubAuthEnv } from './sign-in'

// Deleting a Host's account (#917, spec #907, ADR 0020): the Events they host and their whole library go with the account, outright. DELETE /api/me removes every
// Event of theirs (finished, Deleted and Running-Session Events too) with everything that hangs on it, deletes their games with the Tags, tells each removed Event's
// room `event.gone`, and removes the games' images no other game still names (ADR 0018). A game held by another Host's Event (which ADR 0018 rules out) refuses.

const hostH = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const hostG = { provider: 'discord', id: '7', name: 'Gast-Host', email: 'gast@example.com', image: undefined } as const
const member1 = { provider: 'twitch', id: '3', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const
const member2 = { provider: 'twitch', id: '4', name: 'Dingo', email: 'dingo@example.com', image: undefined } as const

const T0 = '2090-10-30T10:00:00.000Z'
const NOTE: NotesDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ein Hinweis' }] }] }
const lossy = () => webpOf({ form: 'lossy', width: 256, height: 256 })
const PIXEL = new Uint8Array([1, 2, 3])

describe('deleting a Host\'s account', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)
  const store = memoryImageStore()
  let failKey: string | null = null
  // The same store, but the delete of one key can be made to fail: the objects go on a best-effort basis after the commit.
  const deleted: string[] = []
  const flakyStore = { ...store, async delete(key: string) {
    deleted.push(key)
    if (key === failKey) throw new Error('store is down')
    await store.delete(key)
  } }

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock, imageStore: flakyStore })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    store.clear()
    failKey = null
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const send = sendVia(() => request)
  const deleteMe = (cookie?: string) => send('DELETE', '/api/me', cookie)
  const write = async (slug: string, who: Signed, text: string) => {
    expect((await send('POST', `/api/e/${slug}/messages`, who.cookie, { id: randomUUID(), text })).status).toBe(200)
  }
  const vote = async (slug: string, slotId: string, who: Signed, note: string) => {
    expect((await send('PUT', `/api/e/${slug}/slots/${slotId}/vote`, who.cookie, { value: 'yes', note })).status).toBe(200)
  }
  const home = async (who: Signed) => (await (await send('GET', '/api/e', who.cookie)).json() as HomeView).events.map(entry => entry.slug)
  const archive = async (who: Signed) => (await (await send('GET', '/api/archive', who.cookie)).json() as ArchiveView).events.map(entry => entry.slug)

  const SETTINGS = { teamCount: 2, teamSize: 1, gameCount: 2, pointsTable: { preset: 'linear' as const, values: [1, 0] }, selectionMode: 'lucky_wheel' as const, vetoAllowance: 2 }
  const H_GAMES = [{ key: 'halo', pool: true, values: { name: 'Halo', imageKey: 'K1' } }, { key: 'kart', pool: true, values: { name: 'Kart', imageKey: 'K3', notes: NOTE } }] as const
  const G_GAMES = [{ key: 'copy', pool: true, values: { name: 'Halo (Kopie)', imageKey: 'K1' } }, { key: 'own', pool: true, values: { name: 'Eigenes', imageKey: 'K2' } }] as const

  /**
   * Every table of the public schema, as plain rows (sorted by their JSON text), so "nothing changed" is one equality and a table a later ticket adds is in it
   * without an edit. The image store's keys go with it.
   */
  async function snapshot() {
    const { rows: tables } = await testDb.client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
    const rows: Record<string, string[]> = {}
    for (const { tablename } of tables) {
      rows[tablename] = (await testDb.client.query<{ row: unknown }>(`SELECT to_jsonb(t) AS row FROM "${tablename}" t`)).rows.map(entry => JSON.stringify(entry.row)).sort()
    }
    return { rows, keys: store.keys().sort() }
  }

  /** How many rows of every table that hangs on these Events are left, by table: all zero once the Events are removed. */
  async function hangingOn(eventIds: string[]) {
    const ids = eventIds.map(id => `'${id}'`).join(', ')
    const count = async (sql: string) => (await testDb.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`)).rows[0]!.n
    const rounds = `rounds WHERE event_id IN (${ids})`
    return {
      events: await count(`events WHERE id IN (${ids})`),
      event_members: await count(`event_members WHERE event_id IN (${ids})`),
      sessions: await count(`sessions WHERE event_id IN (${ids})`),
      poll_slots: await count(`poll_slots WHERE event_id IN (${ids})`),
      poll_votes: await count(`poll_votes WHERE slot_id IN (SELECT id FROM poll_slots WHERE event_id IN (${ids}))`),
      messages: await count(`messages WHERE event_id IN (${ids})`),
      activity: await count(`activity WHERE event_id IN (${ids})`),
      rounds: await count(rounds),
      round_places: await count(`round_places WHERE round_id IN (SELECT id FROM ${rounds})`),
      draws: await count(`draws WHERE round_id IN (SELECT id FROM ${rounds})`),
      vetoes: await count(`vetoes WHERE draw_id IN (SELECT id FROM draws WHERE round_id IN (SELECT id FROM ${rounds}))`),
      event_pool_games: await count(`event_pool_games WHERE event_id IN (${ids})`),
      event_game_notes: await count(`event_game_notes WHERE event_id IN (${ids})`),
      event_teams: await count(`event_teams WHERE event_id IN (${ids})`),
      bonus_vetoes: await count(`bonus_vetoes WHERE event_id IN (${ids})`),
      coin_tosses: await count(`coin_tosses WHERE event_id IN (${ids})`),
      countdowns: await count(`countdowns WHERE event_id IN (${ids})`),
    }
  }

  /** The rows of another Host's side of the world: its Events and games, its Events' Slots and pool, and Member 1's membership of them. */
  async function bystanders(hostId: string, memberId: string) {
    const pick = async (sql: string) => (await testDb.client.query<{ row: unknown }>(sql)).rows.map(entry => JSON.stringify(entry.row)).sort()
    return {
      events: await pick(`SELECT to_jsonb(t) AS row FROM events t WHERE host_id = '${hostId}'`),
      games: await pick(`SELECT to_jsonb(t) AS row FROM games t WHERE created_by = '${hostId}'`),
      game_tags: await pick(`SELECT to_jsonb(t) AS row FROM game_tags t WHERE game_id IN (SELECT id FROM games WHERE created_by = '${hostId}')`),
      poll_slots: await pick(`SELECT to_jsonb(t) AS row FROM poll_slots t WHERE event_id IN (SELECT id FROM events WHERE host_id = '${hostId}')`),
      pool: await pick(`SELECT to_jsonb(t) AS row FROM event_pool_games t WHERE event_id IN (SELECT id FROM events WHERE host_id = '${hostId}') AND game_id IN (SELECT id FROM games WHERE created_by = '${hostId}')`),
      member: await pick(`SELECT to_jsonb(t) AS row FROM event_members t WHERE user_id = '${memberId}' AND event_id IN (SELECT id FROM events WHERE host_id = '${hostId}')`),
    }
  }

  /**
   * Host H with four Events: A (a Running Session, Votes with Notes, Messages, a Veto, Activity), B (finished, both Members seated), C (a Deleted Event, Member 2 a former
   * Member) and D (still polling, only H). H's library: halo (image K1) and kart (K3, notes, in A's pool), a game with no image, an archived one (K4) and one sharing
   * kart's key K3, with Tags and Event notes. Host G has Event E (Member 1 and H are Members; H has a Vote and a Message there), a finished Event Fin (Member 1) and an
   * unconnected Event F, and a library of two games: a copy of halo that names the same key K1 (ADR 0018), and one with its own key K2.
   */
  async function world() {
    const a = await startRunningEvent(rig, { host: hostH, players: { m1: member1, m2: member2 }, seats: [['m1', 1], ['m2', 2]], name: 'Event A', settings: SETTINGS, sessions: 2, confirmed: 1, extraSlots: ['2090-11-05T19:00'], join: 'invite', quiet: false, games: H_GAMES })
    const b = await startRunningEvent(rig, { host: hostH, players: { m1: member1, m2: member2 }, seats: [['m1', 1], ['m2', 2]], name: 'Event B', settings: SETTINGS, join: 'invite', quiet: false })
    const c = await setUpEvent(rig, { host: hostH, players: { m2: member2 }, seats: [['m2', 1]], name: 'Event C', quiet: false })
    const d = await setUpEvent(rig, { host: hostH, players: {}, seats: [], name: 'Event D', confirmed: 0, quiet: false })

    const [, open1, open2] = a.slotIds as [string, string, string]
    await vote(a.slug, open1, a.players.m1, 'Gern')
    await vote(a.slug, open2, a.players.m2, 'Mal sehen')
    await write(a.slug, a.players.m1, 'Hallo zusammen')
    await write(a.slug, a.host, 'Willkommen')
    const { drawId } = await hostSpins(rig, a)
    await clockToStop(rig, drawId)
    await playerVetoes(rig, a, drawId, a.players.m1)
    await write(b.slug, b.players.m1, 'Letzte Worte')
    for (const game of [a.games.halo, a.games.kart]) {
      const roundId = await hostSets(rig, b, game.id)
      await hostEntersResult(rig, b, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    }
    await hostFinishes(rig, b, { outcome: 'winner', winners: [1] })
    await testDb.db.update(events).set({ deletedAt: new Date(T0) }).where(eq(events.id, c.eventId))

    const [archived, plain, twin] = await testDb.db.insert(games).values([
      { name: 'Archiviert', imageKey: 'K4', archivedAt: new Date(T0), createdBy: a.host.id },
      { name: 'Ohne Bild', createdBy: a.host.id },
      { name: 'Zwilling', imageKey: 'K3', createdBy: a.host.id },
    ]).returning()
    await testDb.db.insert(gameTags).values([
      { gameId: a.games.halo.id, key: 'koop', label: 'Koop', position: 0 },
      { gameId: a.games.halo.id, key: 'shooter', label: 'Shooter', position: 1 },
      { gameId: a.games.kart.id, key: 'koop', label: 'Koop', position: 0 },
      { gameId: a.games.kart.id, key: 'party', label: 'Party', position: 1 },
      { gameId: archived!.id, key: 'alt', label: 'Alt', position: 0 },
    ])
    await testDb.db.insert(eventGameNotes).values([{ eventId: a.eventId, gameId: a.games.kart.id, notes: NOTE }, { eventId: b.eventId, gameId: a.games.halo.id, notes: NOTE }])

    const e = await startRunningEvent(rig, { host: hostG, players: { m1: member1, h: hostH }, seats: [['m1', 1], ['h', 2]], name: 'Event E', settings: SETTINGS, sessions: 2, confirmed: 1, extraSlots: ['2090-11-05T19:00'], quiet: false, games: G_GAMES })
    const f = await setUpEvent(rig, { host: hostG, players: {}, seats: [], name: 'Event F', confirmed: 0, quiet: false })
    await testDb.db.insert(events).values({ slug: 'fin', inviteToken: 'fin-token', hostId: e.host.id, name: 'Fin', phase: 'finished', finishedAt: new Date(T0) })
    const [fin] = await testDb.db.select().from(events).where(eq(events.slug, 'fin'))
    await testDb.db.insert(eventMembers).values({ eventId: fin!.id, userId: a.players.m1.id })
    await testDb.db.insert(gameTags).values({ gameId: e.games.copy.id, key: 'koop', label: 'Koop', position: 0 })
    await vote(e.slug, e.slotIds[1]!, e.players.h, 'Dabei')
    await write(e.slug, e.players.h, 'Von H')
    const [eMessage] = (await testDb.client.query<{ id: string }>(`SELECT id FROM messages WHERE event_id = '${e.eventId}'`)).rows

    for (const key of ['K1', 'K2', 'K3', 'K4']) await store.put(key, PIXEL, 'image/webp')
    notifier.clear()
    return { a, b, c, d, e, f, finId: fin!.id, hosted: [a.eventId, b.eventId, c.eventId, d.eventId], hId: a.host.id, cookie: a.host.cookie, gId: e.host.id, archived: archived!, plain: plain!, twin: twin!, eMessage: eMessage!.id }
  }

  const ownKeys = ['K3', 'K4']

  describe('everything of the Host\'s', () => {
    it('removes every Event they host, finished, Deleted and with a Running Session, with every row that hangs on it, and leaves the other Host\'s rows alone', async () => {
      const w = await world()
      const before = await hangingOn(w.hosted)
      for (const table of ['events', 'event_members', 'sessions', 'poll_slots', 'poll_votes', 'messages', 'activity', 'rounds', 'round_places', 'draws', 'vetoes', 'event_pool_games', 'event_game_notes'] as const) {
        expect(before[table], `the world has no ${table} row`).toBeGreaterThan(0)
      }
      const others = await bystanders(w.gId, w.a.players.m1.id)

      const response = await deleteMe(w.cookie)

      expect(response.status).toBe(200)
      expect(await response.json() as AccountDeleted).toEqual({ deleted: true })
      expect(Object.values(await hangingOn(w.hosted)).every(count => count === 0), JSON.stringify(await hangingOn(w.hosted))).toBe(true)
      expect(await bystanders(w.gId, w.a.players.m1.id)).toEqual(others)
      // H's own rows in the other Host's Event E end by #681's rule.
      const members = (await testDb.db.select().from(eventMembers).where(eq(eventMembers.eventId, w.e.eventId))).map(row => row.userId)
      expect(members).not.toContain(w.hId)
      expect(members).toEqual(expect.arrayContaining([w.a.players.m1.id, w.gId]))
      expect((await testDb.db.select().from(users).where(eq(users.id, w.hId)))[0]).toMatchObject({ name: '', deletedAt: clock.now() })
    })

    it('deletes the whole library with its Tags, archived games and games with no image, and the Tags no game carries any more are gone', async () => {
      const w = await world()
      expect(await testDb.db.select().from(games).where(eq(games.createdBy, w.hId))).toHaveLength(5)

      await deleteMe(w.cookie)

      expect(await testDb.db.select().from(games).where(eq(games.createdBy, w.hId))).toEqual([])
      const ownTags = await testDb.client.query(`SELECT 1 FROM game_tags WHERE game_id IN ('${[w.a.games.halo.id, w.a.games.kart.id, w.archived.id].join('\', \'')}')`)
      expect(ownTags.rows).toEqual([])
      // The other Host's library is as it was, and its Tags show: only the Tag it carries.
      expect(await testDb.db.select().from(games).where(eq(games.createdBy, w.gId))).toHaveLength(2)
      const tags = await (await send('GET', '/api/games/tags', w.e.host.cookie)).json() as GameTag[]
      expect(tags.map(tag => tag.key)).toEqual(['koop'])
    })

    it('takes the Events off Home and out of the Archive of their Members, and keeps what the other Host hosts', async () => {
      const w = await world()
      expect(await home(w.a.players.m1)).toEqual(expect.arrayContaining([w.a.slug, w.b.slug, w.e.slug]))
      expect(await archive(w.a.players.m1)).toEqual(expect.arrayContaining([w.b.slug, 'fin']))

      await deleteMe(w.cookie)

      for (const member of [w.a.players.m1, w.a.players.m2]) {
        const shown = await home(member)
        for (const slug of [w.a.slug, w.b.slug, w.c.slug, w.d.slug]) expect(shown).not.toContain(slug)
      }
      expect(await home(w.a.players.m1)).toContain(w.e.slug)
      expect(await home(w.a.players.m2)).not.toContain(w.e.slug)
      expect(await archive(w.a.players.m1)).toEqual(['fin'])
    })

    it('answers a removed Event\'s link and Invite link like an unknown one: 404, also for a former Member of the Deleted Event', async () => {
      const w = await world()
      const unknown = await errorOf(await send('GET', '/api/e/gibt-es-nicht', w.a.players.m1.cookie))
      await deleteMe(w.cookie)

      for (const [slug, who] of [[w.a.slug, w.a.players.m1], [w.b.slug, w.a.players.m1], [w.c.slug, w.a.players.m2]] as const) {
        expect(await errorOf(await send('GET', `/api/e/${slug}`, who.cookie))).toEqual(unknown)
      }
      expect(unknown.status).toBe(404)
      const madeUp = await errorOf(await send('GET', '/api/invite/gibt-es-nicht', undefined))
      for (const event of [w.a, w.b, w.c, w.d]) {
        expect(await errorOf(await send('GET', `/api/invite/${event.inviteToken}`, undefined))).toEqual(madeUp)
      }
    })
  })

  describe('the images', () => {
    it('removes the games\' objects but keeps one that another Host\'s game still names (ADR 0018), and deletes a key two of their games share once', async () => {
      const w = await world()
      const picture = await request('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp', 'cookie': w.cookie }, body: lossy() as BodyInit })
      expect(picture.status).toBe(200)
      expect(store.keys().sort()).toHaveLength(5)
      deleted.length = 0

      expect((await deleteMe(w.cookie)).status).toBe(200)

      // K1 stays (G's copy names it) and so does G's own K2; the profile picture, K3 (two games of H's) and K4 are gone, each asked for once.
      expect(store.keys().sort()).toEqual(['K1', 'K2'])
      expect(deleted).toHaveLength(3)
      expect(deleted.filter(key => key === 'K3')).toHaveLength(1)
      expect(await testDb.db.select().from(games).where(eq(games.imageKey, 'K1'))).toMatchObject([{ createdBy: w.gId }])
      for (const key of ownKeys) expect(store.keys()).not.toContain(key)
    })

    it('still answers 200 when the store cannot delete one object, logs it and removes the others', async () => {
      const w = await world()
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      failKey = 'K3'

      const response = await deleteMe(w.cookie)

      expect(response.status).toBe(200)
      expect(log).toHaveBeenCalled()
      expect(store.keys().sort()).toEqual(['K1', 'K2', 'K3'])
    })
  })

  describe('the rooms', () => {
    it('tells every removed Event event.gone and nothing else, the Running-Session Event, the finished and the Deleted one among them', async () => {
      const w = await world()
      const now = clock.now().getTime()

      await deleteMe(w.cookie)

      for (const eventId of w.hosted) {
        expect(notifier.messages(eventId), eventId).toEqual([{ type: 'event.gone', v: 1, serverTime: now }])
        expect(notifier.sends(eventId)).toEqual([{ to: null, messages: notifier.messages(eventId) }])
        expect(notifier.closes(eventId)).toEqual([])
      }
    })

    it('keeps #681\'s messages for the other Host\'s Event the Host was a Member of, and tells no other room', async () => {
      const w = await world()

      await deleteMe(w.cookie)

      expect(notifier.messages(w.e.eventId)).toEqual([
        expect.objectContaining({ type: 'event.changed', v: 1 }),
        expect.objectContaining({ type: 'chat.deleted', id: w.eMessage, deletedBy: 'writer' }),
      ])
      expect(notifier.closes(w.e.eventId)).toEqual([{ users: [w.hId], messages: [expect.objectContaining({ type: 'event.changed' })] }])
      for (const eventId of [w.f.eventId, w.finId]) {
        expect(notifier.messages(eventId)).toEqual([])
        expect(notifier.closes(eventId)).toEqual([])
      }
    })
  })

  describe('a game held by another Host\'s Event', () => {
    /** One row of each table that names a game, in the other Host's Event E, naming this game of H's. */
    const holders = {
      event_pool_games: async (w: Awaited<ReturnType<typeof world>>) => {
        await testDb.db.insert(eventPoolGames).values({ eventId: w.e.eventId, gameId: w.plain.id })
      },
      event_game_notes: async (w: Awaited<ReturnType<typeof world>>) => {
        await testDb.db.insert(eventGameNotes).values({ eventId: w.e.eventId, gameId: w.plain.id, notes: NOTE })
      },
      rounds: async (w: Awaited<ReturnType<typeof world>>) => {
        await testDb.client.query(`INSERT INTO rounds (event_id, game_id, started_at, set_at) VALUES ('${w.e.eventId}', '${w.plain.id}', '${T0}', '${T0}')`)
      },
      draws: async (w: Awaited<ReturnType<typeof world>>) => {
        await testDb.client.query(`INSERT INTO rounds (id, event_id, game_id, started_at, set_at) VALUES ('${randomUUID()}', '${w.e.eventId}', '${w.e.games.own.id}', '${T0}', '${T0}')`)
        await testDb.client.query(`INSERT INTO draws (round_id, game_id, source, kind, committed_at, stop_at) SELECT id, '${w.plain.id}', 'library', 'set', '${T0}', '${T0}' FROM rounds WHERE event_id = '${w.e.eventId}'`)
      },
    }

    for (const [table, hold] of Object.entries(holders)) {
      it(`is refused with account_games_held when ${table} names one of the User's games, and nothing changes`, async () => {
        const w = await world()
        await hold(w)
        const before = await snapshot()

        const response = await deleteMe(w.cookie)

        expect(await errorOf(response)).toEqual({ status: 409, code: 'account_games_held' })
        expect(await snapshot()).toEqual(before)
        for (const eventId of [...w.hosted, w.e.eventId]) {
          expect(notifier.messages(eventId)).toEqual([])
          expect(notifier.closes(eventId)).toEqual([])
        }
      })
    }

    it('is no refusal when only their own Event names the game: it goes with the Event', async () => {
      const w = await world()
      const own = await testDb.client.query(`SELECT 1 FROM event_pool_games WHERE event_id = '${w.a.eventId}' AND game_id = '${w.a.games.halo.id}'`)
      expect(own.rows).toHaveLength(1)

      expect((await deleteMe(w.cookie)).status).toBe(200)
    })

    it('is counted by the operator\'s query: 0 when no game is held, 1 for a game another Host\'s Event names', async () => {
      const w = await world()
      const count = async () => (await testDb.client.query<{ n: number }>(OPERATORS_QUERY)).rows[0]!.n
      expect(await count()).toBe(0)

      await holders.event_pool_games(w)

      expect(await count()).toBe(1)
    })
  })

  describe('the foreign keys that decide the deletion', () => {
    const withoutCascade = async (table: string) => (await testDb.client.query<{ name: string }>(
      `SELECT conrelid::regclass::text AS name FROM pg_constraint WHERE contype = 'f' AND confrelid = '${table}'::regclass AND confdeltype <> 'c' ORDER BY 1`,
    )).rows.map(row => row.name)

    it('names every table that references events without a cascade: only event_members, which deleteUser deletes itself', async () => {
      // A new table that references `events` without ON DELETE CASCADE fails here: delete its rows in step 4 of deleteUser (server/utils/delete-user.ts), then add it.
      expect(await withoutCascade('events')).toEqual(['event_members'])
    })

    it('names every table that references games without a cascade: the four deleteUser refuses on (games_held)', async () => {
      // A new table that references `games` without a cascade fails here: add it to the games_held check (step 3 of deleteUser) and to the operator's query.
      expect(await withoutCascade('games')).toEqual(['draws', 'event_game_notes', 'event_pool_games', 'rounds'])
    })
  })

  describe('a failure', () => {
    it('leaves everything as it was: every table, the objects, and no message to any room', async () => {
      const w = await world()
      // The last statement fails: the placeholder email is taken already, so the unique index on the email refuses the emptied row.
      await testDb.db.insert(users).values({ name: 'Besetzt', email: `${w.hId}@deleted.placeholder.invalid` })
      const before = await snapshot()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await deleteMe(w.cookie)

      expect(response.status).toBe(500)
      expect(await snapshot()).toEqual(before)
      for (const eventId of [...w.hosted, w.e.eventId]) {
        expect(notifier.messages(eventId)).toEqual([])
        expect(notifier.closes(eventId)).toEqual([])
      }
    })
  })

  describe('the edge counts', () => {
    it('deletes a Host with no Event and no game: 200 and no room is told', async () => {
      const lonely = await hostSignsIn(rig, hostH)
      const bystander = await setUpEvent(rig, { host: hostG, players: {}, seats: [], confirmed: 0 })

      expect((await deleteMe(lonely.cookie)).status).toBe(200)

      expect((await testDb.db.select().from(users).where(eq(users.id, lonely.id)))[0]!.deletedAt).toEqual(clock.now())
      expect(notifier.messages(bystander.eventId)).toEqual([])
      expect(notifier.closes(bystander.eventId)).toEqual([])
    })

    it('deletes a Host with one Event and no game', async () => {
      const only = await setUpEvent(rig, { host: hostH, players: {}, seats: [], confirmed: 0, quiet: false })

      expect((await deleteMe(only.host.cookie)).status).toBe(200)

      expect((await hangingOn([only.eventId])).events).toBe(0)
      expect(notifier.messages(only.eventId)).toEqual([expect.objectContaining({ type: 'event.gone' })])
    })

    it('deletes a Host with one game and no Event, its image removed', async () => {
      const lonely = await hostSignsIn(rig, hostH)
      await testDb.db.insert(games).values({ name: 'Allein', imageKey: 'K9', createdBy: lonely.id })
      await store.put('K9', PIXEL, 'image/webp')

      expect((await deleteMe(lonely.cookie)).status).toBe(200)

      expect(await testDb.db.select().from(games)).toEqual([])
      expect(store.keys()).toEqual([])
    })

    it('deletes a Host with two Events, one finished and one with a Running Session, and two games sharing one key', async () => {
      const running = await startRunningEvent(rig, { host: hostH, players: { m1: member1, m2: member2 }, seats: [['m1', 1], ['m2', 2]], name: 'Läuft', settings: SETTINGS, quiet: false })
      const done = await setUpEvent(rig, { host: hostH, players: { m1: member1 }, seats: [], name: 'Fertig', quiet: false })
      await testDb.db.update(events).set({ phase: 'finished', finishedAt: new Date(T0) }).where(eq(events.id, done.eventId))
      await testDb.db.insert(games).values([{ name: 'Eins', imageKey: 'K5', createdBy: running.host.id }, { name: 'Zwei', imageKey: 'K5', createdBy: running.host.id }])
      await store.put('K5', PIXEL, 'image/webp')
      notifier.clear()

      expect((await deleteMe(running.host.cookie)).status).toBe(200)

      expect((await hangingOn([running.eventId, done.eventId])).events).toBe(0)
      expect(store.keys()).toEqual([])
      for (const eventId of [running.eventId, done.eventId]) expect(notifier.messages(eventId)).toEqual([expect.objectContaining({ type: 'event.gone' })])
    })
  })
})

/**
 * The operator's check before the Release (spec #907, #917): the games another Host's Event names, which would refuse their owner's deletion. Expected answer 0 on
 * staging and production. It counts games, not Users or names.
 */
const OPERATORS_QUERY = `
SELECT count(DISTINCT g.id)::int AS n
FROM games g
JOIN (
  SELECT game_id, event_id FROM event_pool_games
  UNION ALL SELECT game_id, event_id FROM event_game_notes
  UNION ALL SELECT game_id, event_id FROM rounds WHERE game_id IS NOT NULL
  UNION ALL SELECT d.game_id, r.event_id FROM draws d JOIN rounds r ON r.id = d.round_id
) held ON held.game_id = g.id
JOIN events e ON e.id = held.event_id
WHERE e.host_id <> g.created_by`
