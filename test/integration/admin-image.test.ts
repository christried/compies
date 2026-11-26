import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '../../server/db/schema'
import { memoryImageStore } from '../../server/utils/image-store'
import type { AuthUser, RemovedProfileImage, SavedProfileImage } from '../../shared/auth'
import { webpOf } from '../webp-fixtures'
import { createTestApp, errorOf, sendVia, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { hostSignsIn, signInAs, type Rig, type Signed } from './scenario'
import { setAllowlist, stubAuthEnv } from './sign-in'

// The Platform admin removes another User's uploaded Profile picture (#940, spec #938): DELETE /api/admin/users/:id/image, the one write of the Admin page's
// Nutzer rows that touches a picture. Everyone else, signed in or not, gets the answer of a missing route. The Profile picture of the User's own route
// (#911) is the reference for what goes: the key from the User, then the object from the store.

const admin = { provider: 'discord', id: '1', name: 'Wurzelwerk', email: 'admin@example.com', image: undefined } as const
const host = { provider: 'discord', id: '2', name: 'Hostess', email: 'host@example.com', image: undefined } as const
const plain = { provider: 'twitch', id: '3', name: 'Quokka', email: 'quokka@example.com', image: 'https://example.com/quokka.png' } as const
const bare = { provider: 'twitch', id: '4', name: 'Wombat', email: 'wombat@example.com', image: undefined } as const
const leaver = { provider: 'discord', id: '5', name: 'Dingo', email: 'dingo@example.com', image: undefined } as const

const lossy = () => webpOf({ form: 'lossy', width: 256, height: 256 })

describe('the Platform admin removes a Profile picture (#940)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest
  let rig: Rig
  const store = memoryImageStore()
  const send = sendVia(() => request)

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db, { imageStore: store })
    rig = { request, db: testDb.db }
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    setAllowlist({ admins: 'discord:1' })
    await resetDatabase(testDb.db)
    store.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const rowOf = async (id: string) => (await testDb.db.select().from(users).where(eq(users.id, id)))[0]!
  const keyOf = async (id: string) => (await rowOf(id)).profileImageKey
  const remove = (cookie: string | undefined, id: string) => send('DELETE', `/api/admin/users/${id}/image`, cookie)
  const me = async (cookie: string) => (await (await request('/api/me', { headers: { cookie } })).json() as { user: AuthUser }).user

  /** The User uploads a Profile picture of their own; the answer is the address the page showed. */
  async function uploadFor(signed: Signed): Promise<string> {
    const response = await request('/api/me/image', {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'cookie': signed.cookie },
      body: lossy() as BodyInit,
    })
    expect(response.status).toBe(200)
    return (await response.json() as SavedProfileImage).image
  }

  describe('DELETE /api/admin/users/:id/image', () => {
    it('removes the uploaded picture: the key goes from the User, the object from the store, and the User\'s address now answers like a missing route', async () => {
      const adminSigned = await signInAs(rig, admin)
      const withProvider = await signInAs(rig, plain)
      const address = await uploadFor(withProvider)
      expect(store.keys()).toHaveLength(1)

      const response = await remove(adminSigned.cookie, withProvider.id)

      expect(response.status).toBe(200)
      expect(await response.json() as RemovedProfileImage).toEqual({ image: 'https://example.com/quokka.png' })
      expect(await keyOf(withProvider.id)).toBeNull()
      expect(store.keys()).toEqual([])
      const gone = await request(address)
      const unknown = await request('/api/images/nope.webp')
      expect(gone.status).toBe(404)
      expect(gone.statusText).toBe(unknown.statusText)
      expect(await gone.text()).toBe(await unknown.clone().text())
    })

    it('shows the User the provider\'s picture at the next load: /api/me carries the provider\'s address and no own picture', async () => {
      const adminSigned = await signInAs(rig, admin)
      const withProvider = await signInAs(rig, plain)
      await uploadFor(withProvider)

      await remove(adminSigned.cookie, withProvider.id)

      expect(await me(withProvider.cookie)).toMatchObject({ image: 'https://example.com/quokka.png', hasOwnImage: false })
    })

    it('answers like a missing route for a User without an uploaded picture, and changes no row', async () => {
      const adminSigned = await signInAs(rig, admin)
      const friend = await signInAs(rig, bare)
      const before = await rowOf(friend.id)

      const response = await remove(adminSigned.cookie, friend.id)

      expect(await errorOf(response)).toEqual({ status: 404, code: 'Not Found' })
      expect(await rowOf(friend.id)).toEqual(before)
    })

    it('leaves another User\'s picture alone when the removal is for a User without one', async () => {
      const adminSigned = await signInAs(rig, admin)
      const withUpload = await signInAs(rig, plain)
      const friend = await signInAs(rig, bare)
      await uploadFor(withUpload)
      const keyBefore = await keyOf(withUpload.id)

      await remove(adminSigned.cookie, friend.id)

      expect(await keyOf(withUpload.id)).toBe(keyBefore)
      expect(store.keys()).toHaveLength(1)
    })

    it('answers like a missing route for an unknown id, a malformed id and a Deleted User, and changes nothing of the Deleted User', async () => {
      const adminSigned = await signInAs(rig, admin)
      const gone = await signInAs(rig, leaver)
      await uploadFor(gone)
      await testDb.db.update(users).set({ deletedAt: new Date('2026-06-01T10:00:00.000Z') }).where(eq(users.id, gone.id))
      const before = await rowOf(gone.id)
      const keys = store.keys()

      for (const id of [randomUUID(), 'kein-uuid', gone.id]) {
        expect(await errorOf(await remove(adminSigned.cookie, id)), id).toEqual({ status: 404, code: 'Not Found' })
      }
      expect(await rowOf(gone.id)).toEqual(before)
      expect(store.keys()).toEqual(keys)
    })

    it('answers a signed-out request, a User and a Host with the answer of a missing route, and removes nothing', async () => {
      const adminSigned = await signInAs(rig, admin)
      const withUpload = await signInAs(rig, plain)
      const hostSigned = await hostSignsIn(rig, host)
      await uploadFor(withUpload)
      const keyBefore = await keyOf(withUpload.id)
      const missing = await errorOf(await send('GET', '/api/gibt-es-nicht', undefined))
      const target = `/api/admin/users/${withUpload.id}/image`

      for (const cookie of [undefined, withUpload.cookie, hostSigned.cookie]) {
        expect(await errorOf(await send('DELETE', target, cookie)), String(cookie)).toEqual(missing)
      }
      expect(missing).toEqual({ status: 404, code: 'Not Found' })
      expect(await keyOf(withUpload.id)).toBe(keyBefore)
      expect(store.keys()).toHaveLength(1)
      expect((await send('DELETE', target, adminSigned.cookie)).status).toBe(200)
    })

    it('logs one line with the action and the two User ids, and no name', async () => {
      const adminSigned = await signInAs(rig, admin)
      const withUpload = await signInAs(rig, plain)
      await uploadFor(withUpload)
      const info = vi.spyOn(console, 'info').mockImplementation(() => {})

      await remove(adminSigned.cookie, withUpload.id)

      expect(info).toHaveBeenCalledTimes(1)
      expect(info.mock.calls[0]!.join(' ')).toBe(`admin.image.remove ${adminSigned.id} ${withUpload.id}`)
      expect(info.mock.calls[0]!.join(' ')).not.toContain('Quokka')
    })
  })
})
