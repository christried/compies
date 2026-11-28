import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAccount, Stopped } from '../../server/utils/delete-account'
import { authAccounts, eventMembers, eventPoolGames, events, gameTags, games, messages, pollSlots, pollVotes, users } from '../../server/db/schema'
import { deleteUser, removeImages, UserNotDeletable } from '../../server/utils/delete-user'
import { memoryImageStore, type ImageStore } from '../../server/utils/image-store'
import { createTestDb, resetDatabase } from './harness'

// The deletion of one account as a report (#919, spec #907; server/utils/delete-account.ts, whose dry run gives the Admin page's counts): it takes a database, a store
// and the functions of server/utils/delete-user.ts, and returns what the deletion removes or ends. What a test pins is the report and the rows afterwards.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const H = id(1) // the User who is deleted
const G = id(2) // another Host
const M = id(3) // a Member of H's Event
const [E1, E2, G1, G2, G3] = [id(11), id(12), id(13), id(14), id(15)] as const
const [SLOT1, SLOTG1, SLOTG2] = [id(21), id(22), id(23)] as const
const [GAME1, GAME2, GAME3, GAME4, COPY] = [id(31), id(32), id(33), id(34), id(35)] as const
const PICTURE = `profile/${id(41)}`
const [K1, K2] = [`games/${GAME1}`, `games/${GAME4}`]
const PIXEL = new Uint8Array([1, 2, 3])
const NOW = new Date('2090-10-30T10:00:00.000Z')

const NAME = 'Zebrafink Testname'
const EMAIL = 'zebra@example.com'
const DISPLAY = 'Zebrinchen'
const TEXT = 'Zebrageheim Nachricht'
const EVENT_NAME = 'Zebra Abend'
const SLUG = 'zebra-abend'

describe('the deletion of one account as a report (#919)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  const store = memoryImageStore()
  const deletion = { deleteUser, removeImages, UserNotDeletable }

  beforeAll(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    store.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * H hosts E1 (open, with Member M, a Slot, a Vote of H's and one of M's, and a Message each) and E2 (a Deleted Event). H's library is four games: GAME1 (image K1, with a
   * Tag), GAME2 (no image), GAME3 (archived, the same key K1) and GAME4 (K2, which G's copy names too). H is also a Member of G's open Event G1 (a Vote, a live Message and
   * a Message the Host deleted), of G's finished Event G2 (a Vote, a live Message) and of G's Deleted Event G3. H has a Profile picture; the store holds it, K1, K2 and one object
   * nobody names.
   */
  async function world() {
    const { db } = testDb
    await db.insert(users).values([
      { id: H, name: NAME, email: EMAIL, displayName: DISPLAY, canHost: true, profileImageKey: PICTURE },
      { id: G, name: 'Gastgeberin', email: 'gast@example.com', canHost: true },
      { id: M, name: 'Mitspieler', email: 'mit@example.com' },
    ])
    await db.insert(authAccounts).values({ accountId: '4711', providerId: 'discord', userId: H })
    await db.insert(events).values([
      { id: E1, slug: SLUG, inviteToken: 'zebra-token', hostId: H, name: EVENT_NAME, phase: 'poll' },
      { id: E2, slug: 'zweites', inviteToken: 'zweites-token', hostId: H, name: 'Zweites', phase: 'poll', deletedAt: NOW },
      { id: G1, slug: 'g-offen', inviteToken: 'g-offen-token', hostId: G, name: 'G offen', phase: 'poll' },
      { id: G2, slug: 'g-fertig', inviteToken: 'g-fertig-token', hostId: G, name: 'G fertig', phase: 'finished', finishedAt: NOW },
      { id: G3, slug: 'g-geloescht', inviteToken: 'g-geloescht-token', hostId: G, name: 'G gelöscht', phase: 'poll', deletedAt: NOW },
    ])
    await db.insert(eventMembers).values([
      { eventId: E1, userId: H },
      { eventId: E1, userId: M },
      { eventId: G1, userId: H },
      { eventId: G2, userId: H },
      { eventId: G3, userId: H },
    ])
    await db.insert(pollSlots).values([
      { id: SLOT1, eventId: E1, startsAt: NOW },
      { id: SLOTG1, eventId: G1, startsAt: NOW },
      { id: SLOTG2, eventId: G2, startsAt: NOW },
    ])
    await db.insert(pollVotes).values([
      { slotId: SLOT1, userId: H, value: 'yes', note: TEXT },
      { slotId: SLOT1, userId: M, value: 'maybe' },
      { slotId: SLOTG1, userId: H, value: 'yes' },
      { slotId: SLOTG2, userId: H, value: 'no' },
    ])
    await db.insert(messages).values([
      { id: id(51), eventId: E1, writerId: H, text: TEXT, writtenAt: NOW },
      { id: id(52), eventId: E1, writerId: M, text: 'Hallo', writtenAt: NOW },
      { id: id(53), eventId: G1, writerId: H, text: TEXT, writtenAt: NOW },
      { id: id(54), eventId: G1, writerId: H, text: null, writtenAt: NOW, deletedAt: NOW, deletedBy: 'host' },
      { id: id(55), eventId: G2, writerId: H, text: TEXT, writtenAt: NOW },
    ])
    await db.insert(games).values([
      { id: GAME1, name: 'Halo', imageKey: K1, createdBy: H },
      { id: GAME2, name: 'Ohne Bild', createdBy: H },
      { id: GAME3, name: 'Archiviert', imageKey: K1, archivedAt: NOW, createdBy: H },
      { id: GAME4, name: 'Kart', imageKey: K2, createdBy: H },
      { id: COPY, name: 'Kart (Kopie)', imageKey: K2, createdBy: G },
    ])
    await db.insert(gameTags).values({ gameId: GAME1, key: 'koop', label: 'Koop', position: 0 })
    for (const key of [PICTURE, K1, K2, 'unbenannt']) await store.put(key, PIXEL, 'image/webp')
  }

  /** What the deletion of `world()` removes or ends, counted by hand from the seed above. */
  const REPORT = {
    hostedEvents: [E1, E2],
    games: 4,
    messages: 3,
    votes: 3,
    membershipsEnding: 1,
    membershipsStaying: 1,
    imageObjects: 2,
  }

  /** Every table of the public schema as sorted JSON rows, plus the store's keys: "nothing changed" is one equality, and a table a later ticket adds is in it. */
  async function snapshot(without: string[] = []) {
    const { rows: tables } = await testDb.client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
    const rows: Record<string, string[]> = {}
    for (const { tablename } of tables) {
      rows[tablename] = (await testDb.client.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(t) AS row FROM "${tablename}" t`)).rows
        .map(entry => JSON.stringify(Object.fromEntries(Object.entries(entry.row).filter(([column]) => !without.includes(column)))))
        .sort()
    }
    return { rows, keys: store.keys().sort() }
  }

  const run = (userId: string, apply: boolean, withStore: ImageStore = store) =>
    deleteAccount({ db: testDb.db, userId, apply, now: NOW, deletion, store: apply ? withStore : undefined })

  const sorted = <T extends { hostedEvents: string[] }>(report: T) => ({ ...report, hostedEvents: [...report.hostedEvents].sort() })
  const withoutLeft = <T extends { imagesLeft: number | null }>({ imagesLeft: _left, ...report }: T) => report

  describe('a dry run', () => {
    it('returns the counts of the seed and changes nothing: not a row, not an object, and it takes no store', async () => {
      await world()
      const before = await snapshot()
      // A store handed to a dry run is not touched either.
      const touched = vi.fn()
      const watching = { put: touched, get: touched, delete: touched }

      const report = await deleteAccount({ db: testDb.db, userId: H, apply: false, now: NOW, deletion, store: watching })

      expect(sorted(report)).toEqual({ ...REPORT, imagesLeft: null })
      expect(await snapshot()).toEqual(before)
      expect(touched).not.toHaveBeenCalled()
      // The emptied row came back too (the savepoint was rolled back with the outer transaction).
      expect((await testDb.db.select().from(users).where(eq(users.id, H)))[0]).toMatchObject({ name: NAME, email: EMAIL, deletedAt: null, profileImageKey: PICTURE })
    })

    it('runs without a store at all', async () => {
      await world()

      expect(sorted(await deleteAccount({ db: testDb.db, userId: H, apply: false, now: NOW, deletion }))).toEqual({ ...REPORT, imagesLeft: null })
    })
  })

  describe('with apply', () => {
    it('commits the deletion and removes the images, with the report the dry run gave', async () => {
      await world()
      const dry = await run(H, false)

      const report = await run(H, true)

      expect(withoutLeft(sorted(report))).toEqual(withoutLeft(sorted(dry)))
      expect(report.imagesLeft).toBe(0)
      expect((await testDb.db.select().from(users).where(eq(users.id, H)))[0]).toMatchObject({ name: '', email: `${H}@deleted.placeholder.invalid`, deletedAt: NOW, profileImageKey: null, displayName: null })
      expect(await testDb.db.select().from(events).where(eq(events.hostId, H))).toEqual([])
      expect(await testDb.db.select().from(games).where(eq(games.createdBy, H))).toEqual([])
      expect(await testDb.db.select().from(gameTags)).toEqual([])
      const written = await testDb.db.select().from(messages).where(eq(messages.writerId, H))
      // E1's Message went with E1; G1's own Message lost its text, the one the Host deleted stays as it was, G2's lost its text too.
      expect(written.map(message => [message.eventId, message.text, message.deletedBy]).sort()).toEqual([[G1, null, 'host'], [G1, null, 'writer'], [G2, null, 'writer']].sort())
      // The other Host's open Event: H is no Member any more; the finished Event: H stays on the Seat or the Stands.
      // (The module ends the membership of the Deleted Event G3 as well, which no count above names.)
      expect((await testDb.db.select().from(eventMembers).where(eq(eventMembers.userId, H))).map(row => row.eventId)).toEqual([G2])
      // The images: the Profile picture and K1 (two of H's games, once) are gone; K2 stays, G's copy names it.
      expect(store.keys().sort()).toEqual([K2, 'unbenannt'])
    })

    it('leaves the rows a deleteUser run does on a second identical world, and the same objects', async () => {
      await world()
      await run(H, true)
      const byScript = await snapshot(['created_at', 'updated_at', 'joined_at'])

      store.clear()
      await resetDatabase(testDb.db)
      await world()
      const done = await deleteUser(testDb.db, H, NOW)
      await removeImages(store, done.imageKeys)

      expect(await snapshot(['created_at', 'updated_at', 'joined_at'])).toEqual(byScript)
    })

    it('counts the same as the dry run does on an identical world', async () => {
      await world()
      const dry = await run(H, false)
      store.clear()
      await resetDatabase(testDb.db)
      await world()

      const applied = await run(H, true)

      expect(withoutLeft(sorted(applied))).toEqual(withoutLeft(sorted(dry)))
    })

    it('still completes when the store cannot delete one object, and counts it as left', async () => {
      await world()
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const flaky: ImageStore = { ...store, async delete(key) {
        if (key === K1) throw new Error(`the store is down at account.r2.example.com for ${key}`)
        await store.delete(key)
      } }

      const report = await run(H, true, flaky)

      expect(report).toMatchObject({ imageObjects: 2, imagesLeft: 1 })
      expect((await testDb.db.select().from(users).where(eq(users.id, H)))[0]).toMatchObject({ name: '', deletedAt: NOW })
      expect(store.keys().sort()).toEqual([K1, K2, 'unbenannt'])
      // `removeImages` logs the key and the failure: neither is logged.
      expect(log).not.toHaveBeenCalled()
      expect(console.error).toBe(log)
    })
  })

  describe('a refusal', () => {
    const stopped = async (userId: string, apply: boolean) => {
      const before = await snapshot()
      const error = await run(userId, apply).then(() => null, (failure: unknown) => failure)
      expect(await snapshot()).toEqual(before)
      return error
    }

    it.each([false, true])('stops for an id that no User has, apply %s, and changes nothing', async (apply) => {
      await world()

      const error = await stopped(id(99), apply)

      expect(error).toBeInstanceOf(Stopped)
      expect((error as Error).message).toBe('no User has this id.')
    })

    it('stops for a User who is deleted already, in a dry run and with apply', async () => {
      await world()
      await run(H, true)

      for (const apply of [false, true]) {
        const error = await stopped(H, apply)
        expect(error).toBeInstanceOf(Stopped)
        expect((error as Error).message).toBe('this User is deleted already.')
      }
    })

    it('stops for a game that another Host\'s Event names (games_held), also in a dry run, and changes nothing', async () => {
      await world()
      await testDb.db.insert(eventPoolGames).values({ eventId: G1, gameId: GAME2 })

      for (const apply of [false, true]) {
        const error = await stopped(H, apply)
        expect(error).toBeInstanceOf(Stopped)
        expect((error as Error).message).toBe('a game of this User is named by another Host\'s Event (ADR 0018 rules that out); nothing was changed.')
      }
    })

    it('passes any other error on', async () => {
      await world()
      const failing = { ...deletion, deleteUser: () => Promise.reject(new TypeError('connect ECONNREFUSED 127.0.0.1:5432')) }

      await expect(deleteAccount({ db: testDb.db, userId: H, apply: false, now: NOW, deletion: failing })).rejects.toBeInstanceOf(TypeError)
    })
  })

  describe('the edges', () => {
    it('reports zeros for a User with nothing', async () => {
      await testDb.db.insert(users).values({ id: H, name: NAME, email: EMAIL })

      const report = await run(H, false)

      expect(report).toEqual({ hostedEvents: [], games: 0, messages: 0, votes: 0, membershipsEnding: 0, membershipsStaying: 0, imageObjects: 0, imagesLeft: null })
    })

    it('counts a Host whose only Event is a Deleted Event', async () => {
      await testDb.db.insert(users).values({ id: H, name: NAME, email: EMAIL, canHost: true })
      await testDb.db.insert(events).values({ id: E2, slug: 'weg', inviteToken: 'weg-token', hostId: H, name: 'Weg', phase: 'poll', deletedAt: NOW })

      expect((await run(H, false)).hostedEvents).toEqual([E2])
    })
  })
})
