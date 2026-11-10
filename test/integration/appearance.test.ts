import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { authSessions, users } from '../../server/db/schema'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// A User's Appearance lives on the User, not on a device (#401, GLOSSARY: Appearance): light until they choose otherwise.
describe('the Appearance of a User', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: TestRequest

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestApp(testDb.db)
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(async () => {
    stubAuthEnv()
    await resetDatabase(testDb.db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const kitty = { provider: 'discord', id: '1', name: 'Kitty', email: 'kitty@example.com', image: undefined } as const

  function choose(cookie: string, body: string) {
    return request('/api/me/appearance', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body })
  }

  const appearanceCookie = (response: Response) => response.headers.getSetCookie().find(line => line.startsWith('compies-appearance='))

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

  // The device keeps Dunkel and System in a cookie for the signed-out pages (#403); the route writes it after the save.
  describe('the Appearance cookie from the route', () => {
    it.each(['dark', 'system'])('sets %s for a year, readable by the page', async (value) => {
      const { cookie } = await signIn(testDb.db, kitty)

      const line = appearanceCookie(await choose(cookie, JSON.stringify({ appearance: value })))

      expect(line).toMatch(new RegExp(`^compies-appearance=${value};`))
      expect(line).toContain('Max-Age=31536000')
      expect(line).toContain('Path=/')
      expect(line).toContain('SameSite=Lax')
      expect(line).not.toContain('HttpOnly')
      expect(line).not.toContain('Secure')
    })

    it('removes it for Hell', async () => {
      const { cookie } = await signIn(testDb.db, kitty)

      const line = appearanceCookie(await choose(`${cookie}; compies-appearance=dark`, JSON.stringify({ appearance: 'light' })))

      expect(line).toMatch(/^compies-appearance=;/)
      expect(line).toContain('Max-Age=0')
      expect(line).toContain('Path=/')
    })

    it('marks it Secure on https, as the login session cookie is', async () => {
      vi.stubEnv('BETTER_AUTH_URL', 'https://localhost')
      const { cookie } = await signIn(testDb.db, kitty)

      const line = appearanceCookie(await choose(cookie, JSON.stringify({ appearance: 'dark' })))

      expect(line).toMatch(/^compies-appearance=dark;/)
      expect(line).toContain('Secure')
    })

    it('writes nothing for a refused value or without sign-in', async () => {
      const { cookie } = await signIn(testDb.db, kitty)

      expect(appearanceCookie(await choose(cookie, JSON.stringify({ appearance: 'sepia' })))).toBeUndefined()
      expect(appearanceCookie(await choose(cookie, ''))).toBeUndefined()
      expect(appearanceCookie(await choose('', JSON.stringify({ appearance: 'dark' })))).toBeUndefined()
    })
  })

  // A signed-in page load corrects the device's cookie to the User's Appearance (#403): signing in on another device, or
  // another User's cookie on a shared one. The auth middleware passes the header on to the browser.
  describe('the Appearance cookie from GET /api/me', () => {
    async function meWith(appearance: 'light' | 'dark' | 'system', device = '') {
      const { cookie } = await signIn(testDb.db, kitty)
      await testDb.db.update(users).set({ appearance })
      return request('/api/me', { headers: { cookie: device ? `${cookie}; ${device}` : cookie } })
    }

    it('sets it for a User on Dunkel whose device has none', async () => {
      const line = appearanceCookie(await meWith('dark'))

      expect(line).toMatch(/^compies-appearance=dark;/)
      expect(line).toContain('Max-Age=31536000')
    })

    it('sets system over a dark one for a User on System', async () => {
      expect(appearanceCookie(await meWith('system', 'compies-appearance=dark'))).toMatch(/^compies-appearance=system;/)
    })

    it.each(['dark', 'sepia'])('removes another User\'s or an invalid %s for a User on Hell', async (value) => {
      const line = appearanceCookie(await meWith('light', `compies-appearance=${value}`))

      expect(line).toMatch(/^compies-appearance=;/)
      expect(line).toContain('Max-Age=0')
    })

    it('sends none to a User on Hell without one: a User who never chose anything but Hell gets no cookie', async () => {
      expect(appearanceCookie(await meWith('light'))).toBeUndefined()
    })

    it('leaves a cookie that agrees alone', async () => {
      expect(appearanceCookie(await meWith('dark', 'compies-appearance=dark'))).toBeUndefined()
    })

    it('leaves the cookie of a signed-out device alone, and answers the same body', async () => {
      const response = await request('/api/me', { headers: { cookie: 'compies-appearance=dark' } })

      expect(await response.json()).toEqual({ user: null })
      expect(appearanceCookie(response)).toBeUndefined()
    })

    it('sends the renewed login cookie and the Appearance cookie in one answer', async () => {
      const { cookie } = await signIn(testDb.db, kitty)
      await testDb.db.update(users).set({ appearance: 'dark' })
      await testDb.db.update(authSessions).set({ expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) })

      const lines = (await request('/api/me', { headers: { cookie } })).headers.getSetCookie()

      expect(lines.some(line => line.startsWith('better-auth.session_token='))).toBe(true)
      expect(lines.some(line => line.startsWith('compies-appearance=dark;'))).toBe(true)
    })
  })

  // Better Auth deletes only its own cookies (ADR 0004): the page after Abmelden keeps the look.
  it('leaves the Appearance cookie alone on sign-out', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    const response = await request('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost', 'cookie': `${cookie}; compies-appearance=dark` },
      body: '{}',
    })

    expect(response.status).toBe(200)
    expect(appearanceCookie(response)).toBeUndefined()
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
