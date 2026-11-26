import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { events, users } from '../../server/db/schema'
import { memoryRoomNotifier } from '../../server/utils/room-notifier'
import type { AdminView } from '../../shared/admin'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostCreatesEvent, hostSignsIn, signInAs, type Rig } from './scenario'
import { linkAccount, setAllowlist, signIn, stubAuthEnv } from './sign-in'

// The Admin page's reads and writes (#682, spec #938): the Platform admin's, and nobody else's. Everyone else, signed in or not, gets the answer of a
// missing route (ADR 0002: the flags are read from the database).

const admin = { provider: 'discord', id: '1', name: 'Wurzelwerk', email: 'admin@example.com', image: undefined } as const
const host = { provider: 'discord', id: '2', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const plain = { provider: 'twitch', id: '3', name: 'Quokka', email: 'quokka@example.com', image: 'https://example.com/quokka.png' } as const
const second = { provider: 'twitch', id: '4', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const
const leaver = { provider: 'discord', id: '5', name: 'Dingo', email: 'dingo@example.com', image: undefined } as const
const ghost = { provider: 'discord', id: '6', name: 'Koala', email: 'koala@example.com', image: undefined } as const

describe('the Admin page', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const notifier = memoryRoomNotifier()
  const send = sendVia(() => request)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { roomNotifier: notifier })
    rig = { request, db: testDb.db, notifier }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ admins: 'discord:1' })
    notifier.clear()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const rowOf = async (id: string) => (await testDb.db.select().from(users).where(eq(users.id, id)))[0]!
  const created = (id: string, iso: string) => testDb.db.update(users).set({ createdAt: new Date(iso) }).where(eq(users.id, id))
  const read = async (cookie: string) => (await send('GET', '/api/admin', cookie)).json() as Promise<AdminView>

  describe('who gets in', () => {
    it('answers the read and the write like a missing route to a signed-out request, a User and a Host, and lets the Platform admin in', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const userSigned = await signInAs(rig, plain)
      const missing = await errorOf(await send('GET', '/api/gibt-es-nicht', undefined))
      const target = `/api/admin/users/${userSigned.id}/host`

      for (const cookie of [undefined, userSigned.cookie, hostSigned.cookie]) {
        for (const [method, path, body] of [['GET', '/api/admin', undefined], ['PUT', target, { canHost: true }]] as const) {
          expect(await errorOf(await send(method, path, cookie, body)), `${method} ${path}`).toEqual(missing)
        }
      }
      expect(missing).toEqual({ status: 404, code: 'Not Found' })
      expect((await rowOf(userSigned.id)).canHost).toBe(false)
      expect((await send('GET', '/api/admin', adminSigned.cookie)).status).toBe(200)
      expect((await send('PUT', target, adminSigned.cookie, { canHost: true })).status).toBe(200)
    })

    it('reads the Platform admin mark from the database: an admin mark taken away shuts the page at once', async () => {
      const adminSigned = await signInAs(rig, admin)
      await testDb.db.update(users).set({ isAdmin: false }).where(eq(users.id, adminSigned.id))

      expect((await send('GET', '/api/admin', adminSigned.cookie)).status).toBe(404)
    })
  })

  describe('GET /api/admin', () => {
    it('lists the Users newest first, each with what the page shows and nothing of the provider', async () => {
      const adminSigned = await signInAs(rig, admin)
      const userSigned = await signInAs(rig, plain)
      const hostSigned = await hostSignsIn(rig, host)
      await testDb.db.update(users).set({ displayName: 'Quokka-Q' }).where(eq(users.id, userSigned.id))
      await created(adminSigned.id, '2026-01-10T10:00:00.000Z')
      await created(userSigned.id, '2026-03-05T10:00:00.000Z')
      await created(hostSigned.id, '2026-02-01T10:00:00.000Z')

      const view = await read(adminSigned.cookie)

      expect(view.users.map(entry => entry.id)).toEqual([userSigned.id, hostSigned.id, adminSigned.id])
      expect(view.users[0]).toEqual({
        id: userSigned.id,
        displayName: 'Quokka-Q',
        image: 'https://example.com/quokka.png',
        hasOwnImage: false,
        providers: ['twitch'],
        firstSignInAt: '2026-03-05T10:00:00.000Z',
        canHost: false,
        isAdmin: false,
        openEvents: 0,
      })
      expect(view.users[1]).toMatchObject({ canHost: true, isAdmin: false })
      expect(view.users[2]).toMatchObject({ canHost: true, isAdmin: true })
      expect(view.deletedUsers).toBe(0)
    })

    it('shows a User who has not picked a Display name yet with displayName null, and still lists them', async () => {
      const adminSigned = await signInAs(rig, admin)
      const newcomer = await signInAs(rig, second)

      const view = await read(adminSigned.cookie)

      expect(view.users.find(entry => entry.id === newcomer.id)).toMatchObject({ displayName: null })
    })

    it('lists the providers of every linked account, Discord before Twitch', async () => {
      const adminSigned = await signInAs(rig, admin)
      const both = await signInAs(rig, { ...plain, email: 'both@example.com' })
      await linkAccount(testDb.db, both.cookie, { provider: 'discord', id: '77', name: 'Quokka', email: 'both@example.com' })

      const view = await read(adminSigned.cookie)

      expect(view.users.find(entry => entry.id === both.id)!.providers).toEqual(['discord', 'twitch'])
    })

    it('gives an uploaded Profile picture its address and says so, and the provider picture otherwise', async () => {
      const adminSigned = await signInAs(rig, admin)
      const withUpload = await signInAs(rig, plain)
      await testDb.db.update(users).set({ profileImageKey: 'profile-key-1' }).where(eq(users.id, withUpload.id))
      const withProvider = await signInAs(rig, second)
      await testDb.db.update(users).set({ image: 'https://example.com/wombat.png' }).where(eq(users.id, withProvider.id))

      const view = await read(adminSigned.cookie)

      expect(view.users.find(entry => entry.id === withUpload.id)).toMatchObject({ image: '/api/images/profile-key-1', hasOwnImage: true })
      expect(view.users.find(entry => entry.id === withProvider.id)).toMatchObject({ image: 'https://example.com/wombat.png', hasOwnImage: false })
    })

    it('counts the Events a User hosts that have not finished and are not deleted', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      await hostCreatesEvent(rig, hostSigned, { name: 'Offen eins' })
      await hostCreatesEvent(rig, hostSigned, { name: 'Offen zwei' })
      const finished = await hostCreatesEvent(rig, hostSigned, { name: 'Fertig' })
      const deleted = await hostCreatesEvent(rig, hostSigned, { name: 'Gelöscht' })
      await testDb.db.update(events).set({ phase: 'finished', finishedAt: new Date('2026-05-01T10:00:00.000Z') }).where(eq(events.id, finished.eventId))
      await testDb.db.update(events).set({ deletedAt: new Date('2026-05-02T10:00:00.000Z') }).where(eq(events.id, deleted.eventId))

      const view = await read(adminSigned.cookie)

      expect(view.users.find(entry => entry.id === hostSigned.id)!.openEvents).toBe(2)
      expect(view.users.find(entry => entry.id === adminSigned.id)!.openEvents).toBe(0)
    })

    it('leaves a Deleted User out and counts them', async () => {
      const adminSigned = await signInAs(rig, admin)
      const gone = await signInAs(rig, leaver)
      const gone2 = await signInAs(rig, ghost)
      await testDb.db.update(users).set({ deletedAt: new Date('2026-06-01T10:00:00.000Z') }).where(eq(users.id, gone.id))
      await testDb.db.update(users).set({ deletedAt: new Date('2026-06-02T10:00:00.000Z') }).where(eq(users.id, gone2.id))

      const view = await read(adminSigned.cookie)

      expect(view.users.map(entry => entry.id)).toEqual([adminSigned.id])
      expect(view.deletedUsers).toBe(2)
    })

    it('holds no provider name and no email in the raw response, nor a password or a token', async () => {
      const adminSigned = await signInAs(rig, admin)
      for (const profile of [host, plain, second]) await signIn(testDb.db, profile)

      const raw = await (await send('GET', '/api/admin', adminSigned.cookie)).text()

      for (const secret of ['Wurzelwerk', 'Hostess', 'Quokka"', 'Wombat', '@example.com', 'email', 'access', 'token', '"name"']) {
        expect(raw, secret).not.toContain(secret)
      }
    })
  })

  describe('PUT /api/admin/users/:id/host', () => {
    const put = (cookie: string, id: string, body: unknown) => send('PUT', `/api/admin/users/${id}/host`, cookie, body)
    const event = { name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1 }

    it('grants the permission, and the User creates an Event and sees the library at once, with no new sign-in', async () => {
      const adminSigned = await signInAs(rig, admin)
      const friend = await signInAs(rig, plain)
      expect((await send('GET', '/api/games', friend.cookie)).status).toBe(404)
      expect((await errorOf(await send('POST', '/api/e', friend.cookie, event))).code).toBe('no_host_permission')

      const response = await put(adminSigned.cookie, friend.id, { canHost: true })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ canHost: true })
      expect((await rowOf(friend.id)).canHost).toBe(true)
      expect((await send('GET', '/api/games', friend.cookie)).status).toBe(200)
      const hostSigned = { ...friend }
      await hostCreatesEvent(rig, hostSigned)
    })

    it('takes the permission: a new Event and the library are refused at once, and the Events of the User stay theirs', async () => {
      const adminSigned = await signInAs(rig, admin)
      const hostSigned = await hostSignsIn(rig, host)
      const kept = await hostCreatesEvent(rig, hostSigned, { name: 'Bleibt' })

      const response = await put(adminSigned.cookie, hostSigned.id, { canHost: false })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ canHost: false })
      expect(await errorOf(await send('POST', '/api/e', hostSigned.cookie, event))).toEqual({ status: 403, code: 'no_host_permission' })
      expect((await send('GET', '/api/games', hostSigned.cookie)).status).toBe(404)
      const [stays] = await testDb.db.select().from(events).where(eq(events.id, kept.eventId))
      expect(stays).toMatchObject({ hostId: hostSigned.id, deletedAt: null })
      expect((await send('GET', `/api/e/${kept.slug}`, hostSigned.cookie)).status).toBe(200)
    })

    it('refuses a Platform admin\'s permission off with an error of its own, and changes nothing', async () => {
      const adminSigned = await signInAs(rig, admin)
      const other = await signInAs(rig, second)
      await testDb.db.update(users).set({ isAdmin: true, canHost: true }).where(eq(users.id, other.id))
      const before = await rowOf(other.id)

      for (const target of [adminSigned.id, other.id]) {
        expect(await errorOf(await put(adminSigned.cookie, target, { canHost: false }))).toEqual({ status: 409, code: 'platform_admin_hosts' })
      }

      expect(await rowOf(other.id)).toEqual(before)
      expect((await rowOf(adminSigned.id)).canHost).toBe(true)
    })

    it('succeeds on the value the User has already and changes nothing, not even the row\'s update time', async () => {
      const adminSigned = await signInAs(rig, admin)
      const friend = await signInAs(rig, plain)
      const before = await rowOf(friend.id)

      expect((await put(adminSigned.cookie, friend.id, { canHost: false })).status).toBe(200)
      expect((await put(adminSigned.cookie, adminSigned.id, { canHost: true })).status).toBe(200)

      expect(await rowOf(friend.id)).toEqual(before)
    })

    it('answers like a missing route for an unknown id, a malformed id and a Deleted User', async () => {
      const adminSigned = await signInAs(rig, admin)
      const gone = await signInAs(rig, leaver)
      await testDb.db.update(users).set({ deletedAt: new Date('2026-06-01T10:00:00.000Z') }).where(eq(users.id, gone.id))
      for (const id of [randomUUID(), 'kein-uuid', gone.id]) {
        expect(await errorOf(await put(adminSigned.cookie, id, { canHost: true })), id).toEqual({ status: 404, code: 'Not Found' })
      }
      expect((await rowOf(gone.id)).canHost).toBe(false)
    })

    it('refuses a body without a boolean canHost', async () => {
      const adminSigned = await signInAs(rig, admin)
      const friend = await signInAs(rig, plain)

      for (const body of [{}, { canHost: 'yes' }, { canHost: 1 }, undefined]) {
        expect(await errorOf(await put(adminSigned.cookie, friend.id, body))).toEqual({ status: 400, code: 'invalid_value' })
      }
      expect((await rowOf(friend.id)).canHost).toBe(false)
    })

    it('publishes nothing to a room, and logs one line with the action and the two User ids and no name', async () => {
      const adminSigned = await signInAs(rig, admin)
      const friend = await hostSignsIn(rig, plain)
      const hosted = await hostCreatesEvent(rig, friend)
      const info = vi.spyOn(console, 'info').mockImplementation(() => {})
      notifier.clear()

      await put(adminSigned.cookie, friend.id, { canHost: false })
      await put(adminSigned.cookie, friend.id, { canHost: true })

      expect(info).toHaveBeenCalledTimes(2)
      expect(info.mock.calls[0]!.join(' ')).toBe(`admin.host.take ${adminSigned.id} ${friend.id}`)
      expect(info.mock.calls[1]!.join(' ')).toBe(`admin.host.grant ${adminSigned.id} ${friend.id}`)
      expect(notifier.messages(hosted.eventId)).toEqual([])
      expect(notifier.sends(hosted.eventId)).toEqual([])
    })
  })
})
