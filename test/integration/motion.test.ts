import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '../../server/db/schema'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// Reduced motion belongs to the device (#680, GLOSSARY: Reduced motion): the route sets the cookie `compies-motion` or removes it,
// and touches no database. Prior art: the Appearance cookie from the route (appearance.test.ts, #403).
describe('the Reduced motion cookie from the route', () => {
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
    return request('/api/me/motion', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body })
  }

  const motionCookie = (response: Response) => response.headers.getSetCookie().find(line => line.startsWith('compies-motion='))

  it('sets the cookie to reduced for a year, readable by the page, and answers the choice', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    const response = await choose(cookie, JSON.stringify({ reduced: true }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reduced: true })
    const line = motionCookie(response)
    expect(line).toMatch(/^compies-motion=reduced;/)
    expect(line).toContain('Max-Age=31536000')
    expect(line).toContain('Path=/')
    expect(line).toContain('SameSite=Lax')
    expect(line).not.toContain('HttpOnly')
    expect(line).not.toContain('Secure')
  })

  it('removes the cookie when it is switched off', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    const response = await choose(`${cookie}; compies-motion=reduced`, JSON.stringify({ reduced: false }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reduced: false })
    const line = motionCookie(response)
    expect(line).toMatch(/^compies-motion=;/)
    expect(line).toContain('Max-Age=0')
    expect(line).toContain('Path=/')
  })

  it('marks it Secure on https, as the login session cookie is', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://localhost')
    const { cookie } = await signIn(testDb.db, kitty)

    const line = motionCookie(await choose(cookie, JSON.stringify({ reduced: true })))

    expect(line).toMatch(/^compies-motion=reduced;/)
    expect(line).toContain('Secure')
  })

  it('refuses a signed-out request and sets nothing', async () => {
    const response = await choose('', JSON.stringify({ reduced: true }))

    expect(response.status).toBe(401)
    expect(motionCookie(response)).toBeUndefined()
  })

  it('refuses anything but true and false, and sets nothing', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    for (const value of ['reduced', 'true', 1, 0, null, undefined]) {
      const response = await choose(cookie, JSON.stringify({ reduced: value }))
      expect(response.status, String(value)).toBe(400)
      expect(motionCookie(response), String(value)).toBeUndefined()
    }
    for (const body of ['null', 'true', '[true]', '']) {
      const response = await choose(cookie, body)
      expect(response.status, body).toBe(400)
      expect(motionCookie(response), body).toBeUndefined()
    }
  })

  it('touches no database row', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    const before = await testDb.db.select().from(users)

    await choose(cookie, JSON.stringify({ reduced: true }))
    await choose(cookie, JSON.stringify({ reduced: false }))

    expect(await testDb.db.select().from(users)).toEqual(before)
  })

  // Nothing but the route writes it (spec #856): not the read of the signed-in User, not Abmelden.
  it('is not written by the read of the User, nor by Abmelden', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    const me = await request('/api/me', { headers: { cookie: `${cookie}; compies-motion=reduced` } })
    expect(motionCookie(me)).toBeUndefined()

    const out = await request('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost', 'cookie': `${cookie}; compies-motion=reduced` },
      body: '{}',
    })
    expect(out.status).toBe(200)
    expect(motionCookie(out)).toBeUndefined()
  })
})
