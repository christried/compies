import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { authSessions, eventMembers, events, games, messages, pollVotes, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import type { Db } from '../../server/utils/db'
import { deleteUser } from '../../server/utils/delete-user'
import { memoryImageStore, type ImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { AuthUser } from '../../shared/auth'
import { CURRENT_RELEASE } from '../../server/utils/release'
import { webpOf } from '../webp-fixtures'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { TEST_SETTINGS } from './fixtures'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, hostSignsIn, setUpEvent, signInAs, type Rig, type Signed } from './scenario'
import { stubAuthEnv } from './sign-in'

// Nothing lands after the deletion of an account (#991, spec #907, ADR 0020): a request that passed `requireUser` before the deletion committed, or a
// session row that an OAuth callback in flight inserted after it, must not write for a Deleted User. One lock order serves every write: the Event rows,
// then the users row (`CODING_STANDARDS.md` § Database). The PGlite tests run one connection, so a real race cannot be staged: the stale User is passed in
// through a `requireUser` that still answers the User the request read before the deletion, the store's `put` runs the deletion in the middle of a PUT,
// and the lock order is read off the statements drizzle logs.

const stale = vi.hoisted(() => ({ user: null as AuthUser | null }))
vi.mock('../../server/utils/user', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/utils/user')>()
  return {
    ...original,
    getUser: (event: Parameters<typeof original.getUser>[0]) => stale.user ? Promise.resolve(stale.user) : original.getUser(event),
    requireUser: (event: Parameters<typeof original.requireUser>[0]) => stale.user ? Promise.resolve(stale.user) : original.requireUser(event),
  }
})

const T0 = '2090-10-30T10:00:00.000Z'
const NOW = new Date('2090-10-30T11:00:00.000Z')
const lossy = () => webpOf({ form: 'lossy', width: 256, height: 256 })

const hostP = { provider: 'discord', id: '1', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const doomedP = { provider: 'discord', id: '2', name: 'Quokka', email: 'quokka@example.com', image: undefined } as const
const lateP = { provider: 'twitch', id: '3', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const
const doomedHostP = { provider: 'discord', id: '4', name: 'Gast-Host', email: 'gast@example.com', image: undefined } as const
const otherHostP = { provider: 'twitch', id: '5', name: 'Zweite', email: 'zweite@example.com', image: undefined } as const

describe('writes after the deletion of an account (#991)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let counted: Db
  let request: TestRequest
  let rig: Rig
  const log: { query: string, params: unknown[] }[] = []
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)
  const store = memoryImageStore()
  // A store whose `put` can run a deletion after the object is stored: the deletion that lands between `requireUser` and the update of the PUT.
  let deleteDuringPut: (() => Promise<unknown>) | null = null
  const racingStore: ImageStore = { ...store, async put(key, body, contentType) {
    await store.put(key, body, contentType)
    if (deleteDuringPut) await deleteDuringPut()
  } }

  beforeAll(async () => {
    testDb = await createTestDb()
    const logger = { logQuery: (query: string, params: unknown[]) => void log.push({ query, params }) }
    counted = drizzle({ client: testDb.client, schema, logger }) as unknown as Db
    request = createTestApp(counted, { roomNotifier: notifier, clock, imageStore: racingStore })
    rig = { request, db: counted, clock, notifier }
  })
  afterAll(async () => {
    await testDb.client.close()
  })
  beforeEach(async () => {
    stubAuthEnv()
    clock.set(T0)
    notifier.clear()
    store.clear()
    stale.user = null
    deleteDuringPut = null
    await resetDatabase(counted)
  })
  afterEach(() => vi.unstubAllEnvs())

  const send = sendVia(() => request)
  const meOf = async (cookie: string) => (await (await send('GET', '/api/me', cookie)).json() as { user: AuthUser | null }).user
  const putImage = (cookie: string) => request('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp', cookie }, body: lossy() as BodyInit })
  /** The User as a request read them before the deletion, then the deletion. */
  async function deleted(who: Signed): Promise<AuthUser> {
    const user = await meOf(who.cookie)
    expect(user).not.toBeNull()
    await deleteUser(counted, who.id, NOW)
    return user!
  }

  describe('a session row that appears after the deletion', () => {
    it('reads as signed out: GET /api/me answers no User and a write route answers 401', async () => {
      const doomed = await signInAs(rig, doomedP)
      const [session] = await counted.select().from(authSessions).where(eq(authSessions.userId, doomed.id))
      await deleteUser(counted, doomed.id, NOW)
      // The OAuth callback in flight inserts its session after the commit of the deletion.
      await counted.insert(authSessions).values(session!)

      expect(await meOf(doomed.cookie)).toBeNull()
      const response = await send('POST', '/api/me/appearance', doomed.cookie, { appearance: 'dark' })
      expect(response.status).toBe(401)
      const [row] = await counted.select({ appearance: users.appearance }).from(users).where(eq(users.id, doomed.id))
      expect(row!.appearance).toBe('light')
    })
  })

  describe('the profile image', () => {
    it('a deletion that lands during the PUT: 401, the row keeps no key and the new object is deleted from the store', async () => {
      const doomed = await signInAs(rig, doomedP)
      deleteDuringPut = () => deleteUser(counted, doomed.id, NOW)

      const response = await putImage(doomed.cookie)

      expect(response.status).toBe(401)
      const [row] = await counted.select({ key: users.profileImageKey }).from(users).where(eq(users.id, doomed.id))
      expect(row!.key).toBeNull()
      expect(store.keys()).toEqual([])
    })

    it('two PUTs of one User, one after the other, leave exactly one object: the second', async () => {
      const user = await signInAs(rig, doomedP)
      const put = async () => {
        const response = await putImage(user.cookie)
        expect(response.status).toBe(200)
        return (await response.json() as { image: string }).image
      }
      await put()
      const second = await put()

      expect(store.keys()).toHaveLength(1)
      expect(second.endsWith(store.keys()[0]!)).toBe(true)
      const [row] = await counted.select({ key: users.profileImageKey }).from(users).where(eq(users.id, user.id))
      expect(row!.key).toBe(store.keys()[0])
    })
  })

  describe('a write with the User read before the deletion answers 401 and writes nothing', () => {
    async function world() {
      const event = await setUpEvent(rig, { host: hostP, players: { doomed: doomedP }, seats: [], outsiders: { late: lateP }, confirmed: 0 })
      return event
    }
    const countOf = async (table: typeof messages | typeof pollVotes | typeof eventMembers | typeof events | typeof games) => (await counted.select().from(table)).length

    it('POST /api/me/appearance', async () => {
      const { players } = await world()
      stale.user = await deleted(players.doomed)
      expect((await send('POST', '/api/me/appearance', players.doomed.cookie, { appearance: 'dark' })).status).toBe(401)
      const [row] = await counted.select({ appearance: users.appearance }).from(users).where(eq(users.id, players.doomed.id))
      expect(row!.appearance).toBe('light')
    })

    it('POST /api/me/news-seen', async () => {
      const { players } = await world()
      // An older version seen, so the request would write (a repeat of the stored value writes nothing).
      await counted.update(users).set({ newsSeen: '0.1.0' }).where(eq(users.id, players.doomed.id))
      stale.user = await deleted(players.doomed)
      expect((await send('POST', '/api/me/news-seen', players.doomed.cookie, { version: CURRENT_RELEASE })).status).toBe(401)
      const [row] = await counted.select({ newsSeen: users.newsSeen }).from(users).where(eq(users.id, players.doomed.id))
      expect(row!.newsSeen).toBeNull()
    })

    it('POST /api/me/tour-seen', async () => {
      const { players } = await world()
      stale.user = await deleted(players.doomed)
      expect((await send('POST', '/api/me/tour-seen', players.doomed.cookie, { version: 1 })).status).toBe(401)
      const [row] = await counted.select({ tourSeen: users.tourSeen }).from(users).where(eq(users.id, players.doomed.id))
      expect(row!.tourSeen).toBe(0)
    })

    it('POST /api/me/tour-reset', async () => {
      const { players } = await world()
      stale.user = await deleted(players.doomed)
      expect((await send('POST', '/api/me/tour-reset', players.doomed.cookie)).status).toBe(401)
    })

    it('POST /api/profile/setup', async () => {
      const { players } = await world()
      stale.user = await deleted(players.doomed)
      expect((await send('POST', '/api/profile/setup', players.doomed.cookie, { displayName: 'Quokka' })).status).toBe(401)
      const [row] = await counted.select({ displayName: users.displayName }).from(users).where(eq(users.id, players.doomed.id))
      expect(row!.displayName).toBeNull()
    })

    it('DELETE /api/me/image', async () => {
      const { players } = await world()
      stale.user = await deleted(players.doomed)
      expect((await send('DELETE', '/api/me/image', players.doomed.cookie)).status).toBe(401)
    })

    it('PUT /api/me/image', async () => {
      const { players } = await world()
      stale.user = await deleted(players.doomed)
      const response = await putImage(players.doomed.cookie)
      expect(response.status).toBe(401)
      expect(store.keys()).toEqual([])
      const [row] = await counted.select({ key: users.profileImageKey }).from(users).where(eq(users.id, players.doomed.id))
      expect(row!.key).toBeNull()
    })

    it('POST /api/e/:slug/messages (an Event write through changeEvent): no Message with the text', async () => {
      const event = await world()
      stale.user = await deleted(event.players.doomed)
      const response = await send('POST', `/api/e/${event.slug}/messages`, event.players.doomed.cookie, { id: randomUUID(), text: 'Noch ein Wort' })
      expect(response.status).toBe(401)
      expect(await countOf(messages)).toBe(0)
    })

    it('PUT /api/e/:slug/slots/:id/vote (a Vote with its Note)', async () => {
      const event = await world()
      stale.user = await deleted(event.players.doomed)
      const response = await send('PUT', `/api/e/${event.slug}/slots/${event.slotIds[0]}/vote`, event.players.doomed.cookie, { value: 'yes', note: 'Ich komme' })
      expect(response.status).toBe(401)
      expect(await countOf(pollVotes)).toBe(0)
    })

    it('POST /api/invite/:invite (no membership through the Invite link)', async () => {
      const event = await world()
      const before = await countOf(eventMembers)
      stale.user = await deleted(event.outsiders.late)
      const response = await send('POST', `/api/invite/${event.inviteToken}`, event.outsiders.late.cookie)
      expect(response.status).toBe(401)
      expect(await countOf(eventMembers)).toBe(before)
    })

    it('POST /api/e (no Event of a Deleted User)', async () => {
      await world()
      const doomedHost = await hostSignsIn(rig, doomedHostP)
      const before = await countOf(events)
      stale.user = await deleted(doomedHost)
      const response = await send('POST', '/api/e', doomedHost.cookie, { name: 'Spät', dateMode: 'poll', sessions: 2, slots: ['2090-10-30T20:30', '2090-10-31T19:00'], settings: TEST_SETTINGS })
      expect(response.status).toBe(401)
      expect(await countOf(events)).toBe(before)
    })

    it('POST /api/games (no game of a Deleted User)', async () => {
      await world()
      const doomedHost = await hostSignsIn(rig, doomedHostP)
      stale.user = await deleted(doomedHost)
      const response = await send('POST', '/api/games', doomedHost.cookie, { name: 'Spät' })
      expect(response.status).toBe(401)
      expect(await countOf(games)).toBe(0)
    })

    it('the 401 comes before the 404: a Deleted User, no Member any more, is told to sign in', async () => {
      const event = await world()
      stale.user = await deleted(event.players.doomed)
      const response = await send('PUT', `/api/e/${event.slug}/slots/${event.slotIds[0]}/vote`, event.players.doomed.cookie, { value: 'no' })
      expect(await errorOf(response)).toMatchObject({ status: 401 })
    })
  })

  describe('the lock order of a deletion', () => {
    it('locks every Event the User hosts or is a Member of, in id order, before the users row', async () => {
      // The User hosts one Event and is a Member of another Host's.
      const other = await setUpEvent(rig, { host: otherHostP, players: { guest: hostP }, seats: [], confirmed: 0 })
      const host = await hostSignsIn(rig, hostP)
      const own = await hostCreatesEvent(rig, host)
      expect(other.players.guest.id).toBe(host.id)

      log.length = 0
      await deleteUser(counted, host.id, NOW)

      const locks = log.flatMap((entry, index) => /for update/i.test(entry.query) ? [{ index, ...entry }] : [])
      const usersLock = locks.find(lock => /from "users"/.test(lock.query))
      expect(usersLock).toBeDefined()
      const before = locks.filter(lock => lock.index < usersLock!.index)
      expect(before.length).toBeGreaterThan(0)
      expect(before.every(lock => /"events"/.test(lock.query))).toBe(true)
      const locked = new Set(before.flatMap(lock => lock.params.filter((param): param is string => typeof param === 'string')))
      expect(locked).toEqual(new Set([own.eventId, other.eventId]))
      // One statement locks both, ordered by id, so two deletions that share Events queue up instead of crossing.
      expect(before.some(lock => /order by "events"\."id"|order by "id"/.test(lock.query))).toBe(true)
    })
  })
})
