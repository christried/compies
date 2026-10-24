import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import me from '../../server/api/me.get'
import profileSetup from '../../server/api/profile/setup.post'
import { authSessions, users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { setAllowlist, signIn, stubAuthEnv } from './sign-in'

describe('the signed-in User and profile setup', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, { 'GET /api/me': me, 'POST /api/profile/setup': profileSetup })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    await testDb.db.delete(users)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const kitty = { provider: 'discord', id: '1', name: 'Kitty', email: 'kitty@example.com', image: undefined } as const

  function setup(cookie: string, displayName: unknown) {
    return request('/api/profile/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName }),
    })
  }

  describe('GET /api/me', () => {
    it('answers null when signed out', async () => {
      const response = await request('/api/me')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ user: null })
    })

    it('returns the User with permissions, but never the email', async () => {
      setAllowlist({ hosts: 'discord:1' })
      const { cookie } = await signIn(testDb.db, kitty)

      const { user } = await (await request('/api/me', { headers: { cookie } })).json()

      expect(user).toEqual({
        id: expect.any(String), name: 'Kitty', image: expect.any(String),
        displayName: null, canHost: true, isAdmin: false,
      })
    })

    it('reads permissions from the database, so a change applies without signing in again', async () => {
      const { cookie } = await signIn(testDb.db, kitty)
      await testDb.db.update(users).set({ canHost: true })

      const { user } = await (await request('/api/me', { headers: { cookie } })).json()

      expect(user.canHost).toBe(true)
    })

    it('renews an older login session and passes the new login cookie on', async () => {
      const { cookie } = await signIn(testDb.db, kitty)
      await testDb.db.update(authSessions).set({ expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) })

      const response = await request('/api/me', { headers: { cookie } })

      expect(response.headers.getSetCookie().join('\n')).toMatch(/better-auth\.session_token=.*Max-Age=604800/)
    })

    it('answers null for a forged login session cookie', async () => {
      const response = await request('/api/me', { headers: { cookie: 'better-auth.session_token=forged.token' } })

      expect(await response.json()).toEqual({ user: null })
    })
  })

  describe('POST /api/profile/setup', () => {
    it('saves the trimmed Display name', async () => {
      const { cookie } = await signIn(testDb.db, kitty)

      const response = await setup(cookie, '  Kitty Kat  ')

      expect(response.status).toBe(200)
      expect((await response.json()).user.displayName).toBe('Kitty Kat')
      const [row] = await testDb.db.select().from(users).where(eq(users.email, 'kitty@example.com'))
      expect(row!.displayName).toBe('Kitty Kat')
    })

    it('accepts 32 characters, counting emoji as one', async () => {
      const { cookie } = await signIn(testDb.db, kitty)

      expect((await setup(cookie, 'x'.repeat(32))).status).toBe(200)
      expect((await setup(cookie, '🎮'.repeat(32))).status).toBe(200)
    })

    it('rejects an empty, blank, too long or missing name', async () => {
      const { cookie } = await signIn(testDb.db, kitty)

      for (const displayName of ['', '   ', 'x'.repeat(33), undefined, 42]) {
        expect((await setup(cookie, displayName)).status).toBe(400)
      }
      const [row] = await testDb.db.select().from(users)
      expect(row!.displayName).toBeNull()
    })

    it('requires sign-in', async () => {
      expect((await setup('', 'Kitty')).status).toBe(401)
    })

    it('survives the next sign-in, which only overwrites name and image', async () => {
      const { cookie } = await signIn(testDb.db, kitty)
      await setup(cookie, 'Kitty Kat')

      await signIn(testDb.db, { ...kitty, name: 'Renamed' })

      const [row] = await testDb.db.select().from(users)
      expect(row).toMatchObject({ name: 'Renamed', displayName: 'Kitty Kat' })
    })
  })
})
