import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { authSessions, eventMembers, eventPoolGames, events, games, users } from '../../server/db/schema'
import { testClock } from '../../server/utils/clock'
import { memoryImageStore } from '../../server/utils/image-store'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { AdminUserDeletion } from '../../shared/admin'
import type { AccountDeleted, AuthUser } from '../../shared/auth'
import { webpOf } from '../webp-fixtures'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostSignsIn, signInAs, startRunningEvent, type Rig, type Signed } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// The Platform admin deletes another User's account on that User's request (#941, spec #938, ADR 0020): GET /api/admin/users/:id/deletion counts what would go (the
// counts of the operator's dry run, one function), DELETE /api/admin/users/:id runs the module of #681 and #917 and then does what the User's own route does
// after the commit (test/integration/delete-account.test.ts, delete-host.test.ts cover the module). It leaves the Platform admin's own session alone, refuses a
// Platform admin's id, and answers like a missing route to everyone else.

const admin = { provider: 'discord', id: '1', name: 'Wurzelwerk', email: 'admin@example.com', image: undefined } as const
const otherAdmin = { provider: 'discord', id: '8', name: 'Zweitadmin', email: 'zwei@example.com', image: undefined } as const
const hostH = { provider: 'discord', id: '2', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const hostG = { provider: 'discord', id: '7', name: 'Gast-Host', email: 'gast@example.com', image: undefined } as const
const member = { provider: 'twitch', id: '3', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const
const rival = { provider: 'twitch', id: '4', name: 'Dingo', email: 'dingo@example.com', image: undefined } as const
const plain = { provider: 'twitch', id: '5', name: 'Quokka', email: 'quokka@example.com', image: 'https://example.com/quokka.png' } as const

const T0 = '2090-10-30T10:00:00.000Z'
const NOW = '2090-10-30T11:00:00.000Z'
const lossy = () => webpOf({ form: 'lossy', width: 256, height: 256 })
const SETTINGS = { teamCount: 2, teamSize: 1, gameCount: 2, pointsTable: { preset: 'linear' as const, values: [1, 0] }, selectionMode: 'lucky_wheel' as const, vetoAllowance: 2 }
const PIXEL = new Uint8Array([1, 2, 3])

describe('the Platform admin deletes another User\'s account (#941)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const clock = testClock(T0)
  const store = memoryImageStore()
  const send = sendVia(() => request)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier, clock, imageStore: store })
    rig = { request, db: testDb.db, clock, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ admins: 'discord:1,discord:8' })
    clock.set(T0)
    notifier.clear()
    store.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const rowOf = async (id: string) => (await testDb.db.select().from(users).where(eq(users.id, id)))[0]!
  const counts = (cookie: string | undefined, id: string) => send('GET', `/api/admin/users/${id}/deletion`, cookie)
  const remove = (cookie: string | undefined, id: string) => send('DELETE', `/api/admin/users/${id}`, cookie)
  const me = async (cookie: string) => (await (await send('GET', '/api/me', cookie)).json() as { user: AuthUser | null }).user

  /**
   * Host H hosts A (a Running Session, one Member who wrote a Message) and a finished Event B, with a library of two games (keys K1 and K3, one of them in A's pool),
   * and an uploaded Profile picture. Host G hosts a running Event E (H is a Member with a Message there) and a finished Event Fin (H is a Member there).
   */
  async function world() {
    const a = await startRunningEvent(rig, { host: hostH, players: { m: member, r: rival }, seats: [['m', 1], ['r', 2]], name: 'Event A', settings: SETTINGS, join: 'invite', quiet: false, games: [
      { key: 'halo', pool: true, values: { name: 'Halo', imageKey: 'K1' } },
      { key: 'kart', pool: false, values: { name: 'Kart', imageKey: 'K3' } },
    ] })
    const hId = a.host.id
    const e = await startRunningEvent(rig, { host: hostG, players: { h: hostH, m: member }, seats: [['h', 1], ['m', 2]], name: 'Event E', settings: SETTINGS, join: 'invite', quiet: false })
    const [b] = await testDb.db.insert(events).values({ slug: 'bee', inviteToken: 'bee-token', hostId: hId, name: 'B', phase: 'finished', finishedAt: new Date(T0) }).returning()
    const [fin] = await testDb.db.insert(events).values({ slug: 'fin', inviteToken: 'fin-token', hostId: e.host.id, name: 'Fin', phase: 'finished', finishedAt: new Date(T0) }).returning()
    await testDb.db.insert(eventMembers).values({ eventId: fin!.id, userId: hId })
    expect((await send('POST', `/api/e/${e.slug}/messages`, a.host.cookie, { id: randomUUID(), text: 'Von H' })).status).toBe(200)
    expect((await request('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp', 'cookie': a.host.cookie }, body: lossy() as BodyInit })).status).toBe(200)
    for (const key of ['K1', 'K3']) await store.put(key, PIXEL, 'image/webp')
    notifier.clear()
    return { a, e, hId, hCookie: a.host.cookie, bId: b!.id, finId: fin!.id, memberId: a.players.m.id }
  }

  /** Every table of the public schema as sorted JSON rows, plus the store's keys: "nothing changed" is one equality. */
  async function snapshot() {
    const { rows: tables } = await testDb.client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
    const rows: Record<string, string[]> = {}
    for (const { tablename } of tables) {
      rows[tablename] = (await testDb.client.query<{ row: unknown }>(`SELECT to_jsonb(t) AS row FROM "${tablename}" t`)).rows.map(entry => JSON.stringify(entry.row)).sort()
    }
    return { rows, keys: store.keys().sort() }
  }

  const silent = (): void => void vi.spyOn(console, 'info').mockImplementation(() => {})

  describe('GET /api/admin/users/:id/deletion', () => {
    it('counts what the deletion would remove or end for a Host: hosted Events with finished ones, games, Memberships ending and staying, image objects', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()
      const before = await snapshot()

      const response = await counts(adminSigned.cookie, w.hId)

      expect(response.status).toBe(200)
      // A and B are hosted; E ends (running), Fin stays (finished); two games with K1 and K3 and the Profile picture.
      expect(await response.json() as AdminUserDeletion).toEqual({ hostedEvents: 2, games: 2, membershipsEnding: 1, membershipsStaying: 1, imageObjects: 3 })
      expect(await snapshot()).toEqual(before)
      expect(notifier.messages(w.a.eventId)).toEqual([])
    })

    it('counts zeros for a User who hosts nothing and belongs to nothing', async () => {
      const adminSigned = await signInAs(rig, admin)
      const lonely = await signInAs(rig, plain)

      const response = await counts(adminSigned.cookie, lonely.id)

      expect(await response.json() as AdminUserDeletion).toEqual({ hostedEvents: 0, games: 0, membershipsEnding: 0, membershipsStaying: 0, imageObjects: 0 })
    })

    it('answers only the five counts: no id, no name', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()

      const text = await (await counts(adminSigned.cookie, w.hId)).text()

      expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(['games', 'hostedEvents', 'imageObjects', 'membershipsEnding', 'membershipsStaying'])
      expect(text).not.toContain('Hostess')
    })

    it('refuses with account_games_held when another Host\'s Event names a game of the User, and changes nothing', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()
      const [kart] = await testDb.db.select().from(games).where(eq(games.name, 'Kart'))
      await testDb.db.insert(eventPoolGames).values({ eventId: w.e.eventId, gameId: kart!.id })
      const before = await snapshot()

      expect(await errorOf(await counts(adminSigned.cookie, w.hId))).toEqual({ status: 409, code: 'account_games_held' })
      expect(await snapshot()).toEqual(before)
    })

    it('refuses the Platform admin\'s own id and another Platform admin\'s id with platform_admin_not_deletable', async () => {
      const adminSigned = await signInAs(rig, admin)
      const second = await signInAs(rig, otherAdmin)

      for (const id of [adminSigned.id, second.id]) {
        expect(await errorOf(await counts(adminSigned.cookie, id)), id).toEqual({ status: 409, code: 'platform_admin_not_deletable' })
      }
    })

    it('answers like a missing route for an unknown id, a malformed id and a Deleted User', async () => {
      const adminSigned = await signInAs(rig, admin)
      const gone = await signInAs(rig, plain)
      await testDb.db.update(users).set({ deletedAt: new Date(T0) }).where(eq(users.id, gone.id))

      for (const id of [randomUUID(), 'kein-uuid', gone.id]) {
        expect(await errorOf(await counts(adminSigned.cookie, id)), id).toEqual({ status: 404, code: 'Not Found' })
      }
    })

    it('answers a signed-out request, a User and a Host like a missing route', async () => {
      const adminSigned = await signInAs(rig, admin)
      const plainSigned = await signInAs(rig, plain)
      const hostSigned = await hostSignsIn(rig, hostH)
      const missing = await errorOf(await send('GET', '/api/gibt-es-nicht', undefined))

      for (const cookie of [undefined, plainSigned.cookie, hostSigned.cookie]) {
        expect(await errorOf(await counts(cookie, plainSigned.id)), String(cookie)).toEqual(missing)
      }
      expect((await counts(adminSigned.cookie, plainSigned.id)).status).toBe(200)
    })
  })

  describe('DELETE /api/admin/users/:id', () => {
    it('does what the User\'s own deletion does: answers { deleted: true }, empties and marks the row, ends the sessions, removes the Events, games and objects', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()
      clock.set(NOW)
      silent()

      const response = await remove(adminSigned.cookie, w.hId)

      expect(response.status).toBe(200)
      expect(await response.json() as AccountDeleted).toEqual({ deleted: true })
      expect(await rowOf(w.hId)).toMatchObject({ name: '', email: `${w.hId}@deleted.placeholder.invalid`, displayName: null, profileImageKey: null, canHost: false, deletedAt: new Date(NOW) })
      expect(await testDb.db.select().from(events).where(eq(events.hostId, w.hId))).toEqual([])
      expect(await testDb.db.select().from(games).where(eq(games.createdBy, w.hId))).toEqual([])
      expect(await testDb.db.select().from(eventMembers).where(eq(eventMembers.userId, w.hId))).toHaveLength(1)
      expect(store.keys()).toEqual([])
    })

    it('ends the Deleted User\'s sessions: their old cookie reads as signed out', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()
      expect((await me(w.hCookie))?.id).toBe(w.hId)
      silent()

      await remove(adminSigned.cookie, w.hId)

      expect(await me(w.hCookie)).toBeNull()
      expect(await testDb.db.select().from(authSessions).where(eq(authSessions.userId, w.hId))).toEqual([])
    })

    it('leaves the Platform admin\'s own session working, and sets no cookie on the answer', async () => {
      const adminSigned = await signInAs(rig, admin)
      const lonely = await signInAs(rig, plain)
      silent()

      const response = await remove(adminSigned.cookie, lonely.id)

      expect(response.status).toBe(200)
      expect(response.headers.getSetCookie()).toEqual([])
      expect((await me(adminSigned.cookie))?.id).toBe(adminSigned.id)
      expect((await send('GET', '/api/admin', adminSigned.cookie)).status).toBe(200)
    })

    it('lets the User sign in again as a new User, and the Admin page counts one more Deleted User', async () => {
      const adminSigned = await signInAs(rig, admin)
      const lonely = await signInAs(rig, plain)
      silent()
      const read = async () => (await (await send('GET', '/api/admin', adminSigned.cookie)).json() as { users: { id: string }[], deletedUsers: number })
      expect((await read()).deletedUsers).toBe(0)

      await remove(adminSigned.cookie, lonely.id)

      const after = await read()
      expect(after.deletedUsers).toBe(1)
      expect(after.users.map(user => user.id)).not.toContain(lonely.id)
      const again = await signInAs(rig, plain)
      expect(again.id).not.toBe(lonely.id)
    })

    it('tells the rooms what the own deletion tells them: event.gone for each hosted Event, event.changed and chat.deleted elsewhere, and closes the Deleted User\'s sockets', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()
      silent()

      await remove(adminSigned.cookie, w.hId)

      for (const eventId of [w.a.eventId, w.bId]) {
        expect(notifier.messages(eventId), eventId).toEqual([expect.objectContaining({ type: 'event.gone', v: 1 })])
        expect(notifier.closes(eventId)).toEqual([])
      }
      expect(notifier.messages(w.e.eventId)).toEqual([
        expect.objectContaining({ type: 'event.changed', v: 1 }),
        expect.objectContaining({ type: 'chat.deleted', deletedBy: 'writer' }),
      ])
      expect(notifier.closes(w.e.eventId)).toEqual([{ users: [w.hId], messages: [expect.objectContaining({ type: 'event.changed', v: 1 })] }])
      // A finished Event is told too (the Seat stays, the sockets close).
      expect(notifier.messages(w.finId)).toEqual([expect.objectContaining({ type: 'event.changed' })])
      expect(notifier.closes(w.finId)).toEqual([{ users: [w.hId], messages: [expect.objectContaining({ type: 'event.changed', v: 1 })] }])
    })

    it('logs one line with the action and the two User ids, and no name', async () => {
      const adminSigned = await signInAs(rig, admin)
      const lonely = await signInAs(rig, plain)
      const info = vi.spyOn(console, 'info').mockImplementation(() => {})

      await remove(adminSigned.cookie, lonely.id)

      expect(info).toHaveBeenCalledTimes(1)
      expect(info.mock.calls[0]!.join(' ')).toBe(`admin.user.delete ${adminSigned.id} ${lonely.id}`)
      expect(info.mock.calls[0]!.join(' ')).not.toContain('Quokka')
    })

    it('still answers 200 when the store cannot delete an object', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()
      silent()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(store, 'delete').mockRejectedValue(new Error('store is down'))

      expect((await remove(adminSigned.cookie, w.hId)).status).toBe(200)
      expect((await rowOf(w.hId)).deletedAt).toEqual(clock.now())
    })

    it('refuses the Platform admin\'s own id and another Platform admin\'s id with platform_admin_not_deletable, and changes nothing, no room told', async () => {
      const adminSigned = await signInAs(rig, admin)
      const second = await signInAs(rig, otherAdmin)
      const w = await world()
      const before = await snapshot()

      for (const id of [adminSigned.id, second.id]) {
        expect(await errorOf(await remove(adminSigned.cookie, id)), id).toEqual({ status: 409, code: 'platform_admin_not_deletable' })
      }
      expect(await snapshot()).toEqual(before)
      expect((await me(adminSigned.cookie))?.id).toBe(adminSigned.id)
      expect(notifier.sends(w.e.eventId)).toEqual([])
    })

    it('refuses with account_games_held when another Host\'s Event names a game of the User: nothing changes and no room is told', async () => {
      const adminSigned = await signInAs(rig, admin)
      const w = await world()
      const [kart] = await testDb.db.select().from(games).where(eq(games.name, 'Kart'))
      await testDb.db.insert(eventPoolGames).values({ eventId: w.e.eventId, gameId: kart!.id })
      const before = await snapshot()

      expect(await errorOf(await remove(adminSigned.cookie, w.hId))).toEqual({ status: 409, code: 'account_games_held' })

      expect(await snapshot()).toEqual(before)
      for (const eventId of [w.a.eventId, w.bId, w.e.eventId]) {
        expect(notifier.messages(eventId)).toEqual([])
        expect(notifier.closes(eventId)).toEqual([])
      }
    })

    it('answers like a missing route for an unknown id, a malformed id and a Deleted User, and changes nothing', async () => {
      const adminSigned = await signInAs(rig, admin)
      const gone = await signInAs(rig, plain)
      await testDb.db.update(users).set({ deletedAt: new Date(T0) }).where(eq(users.id, gone.id))
      const before = await snapshot()

      for (const id of [randomUUID(), 'kein-uuid', gone.id]) {
        expect(await errorOf(await remove(adminSigned.cookie, id)), id).toEqual({ status: 404, code: 'Not Found' })
      }
      expect(await snapshot()).toEqual(before)
    })

    it('answers a signed-out request, a User and a Host like a missing route, and deletes nothing', async () => {
      const adminSigned = await signInAs(rig, admin)
      const plainSigned: Signed = await signInAs(rig, plain)
      const hostSigned = await hostSignsIn(rig, hostH)
      const missing = await errorOf(await send('GET', '/api/gibt-es-nicht', undefined))
      const before = await snapshot()

      for (const cookie of [undefined, plainSigned.cookie, hostSigned.cookie]) {
        expect(await errorOf(await remove(cookie, plainSigned.id)), String(cookie)).toEqual(missing)
      }
      expect(await snapshot()).toEqual(before)
      silent()
      expect((await remove(adminSigned.cookie, plainSigned.id)).status).toBe(200)
    })
  })
})
