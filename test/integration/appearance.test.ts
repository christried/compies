import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import me from '../../server/api/me.get'
import appearance from '../../server/api/me/appearance.post'
import profileSetup from '../../server/api/profile/setup.post'
import { users } from '../../server/db/schema'
import { createTestDb, createTestServer } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// A User's Appearance lives on the User, not on a device (#401, GLOSSARY: Appearance): light until they choose otherwise.
describe('the Appearance of a User', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/me': me,
      'POST /api/me/appearance': appearance,
      'POST /api/profile/setup': profileSetup,
    })
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

  function choose(cookie: string, body: string) {
    return request('/api/me/appearance', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body })
  }

  async function appearanceOf(cookie: string) {
    const { user } = await (await request('/api/me', { headers: { cookie } })).json()
    return user.appearance
  }

  async function storedAppearance() {
    const [row] = await testDb.db.select().from(users).where(eq(users.email, kitty.email))
    return row!.appearance
  }

  it('starts a new User light', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    expect(await appearanceOf(cookie)).toBe('light')
  })

  it.each(['light', 'dark', 'system'])('stores %s and answers it', async (value) => {
    const { cookie } = await signIn(testDb.db, kitty)

    const response = await choose(cookie, JSON.stringify({ appearance: value }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ appearance: value })
    expect(await appearanceOf(cookie)).toBe(value)
  })

  it('answers the same value again when it is chosen twice', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await choose(cookie, JSON.stringify({ appearance: 'dark' }))

    const response = await choose(cookie, JSON.stringify({ appearance: 'dark' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ appearance: 'dark' })
  })

  it('refuses anything but the three Appearances, and keeps the stored one', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await testDb.db.update(users).set({ appearance: 'dark' })

    for (const value of ['sepia', 'Dark', '', 42, null, undefined]) {
      expect((await choose(cookie, JSON.stringify({ appearance: value }))).status, String(value)).toBe(400)
    }
    for (const body of ['null', '"dark"', '["dark"]', '']) {
      expect((await choose(cookie, body)).status, body).toBe(400)
    }
    expect(await storedAppearance()).toBe('dark')
  })

  it('requires sign-in, and writes nothing', async () => {
    await signIn(testDb.db, kitty)

    expect((await choose('', JSON.stringify({ appearance: 'dark' }))).status).toBe(401)
    expect(await storedAppearance()).toBe('light')
  })

  // Better Auth never writes the column (ADR 0004).
  it('keeps the Appearance when the User signs in again', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await choose(cookie, JSON.stringify({ appearance: 'dark' }))

    const again = await signIn(testDb.db, kitty)

    expect(await appearanceOf(again.cookie)).toBe('dark')
  })

  it('carries the Appearance in the User the Display name route answers', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await choose(cookie, JSON.stringify({ appearance: 'dark' }))

    const response = await request('/api/profile/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'Kitty' }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()).user.appearance).toBe('dark')
  })
})
