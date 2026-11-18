import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '../../server/db/schema'
import { TOUR_VERSION } from '../../shared/tour'
import { createTestApp, type TestRequest } from './app'
import { createTestDb, resetDatabase } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// The Tour version a User last saw lives on the User, so every device agrees (#646, spec #622): one route raises it and
// never lowers it, one sets it back to 0 for the Profil row.
describe('the Tour version a User has seen', () => {
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
  const dom = { provider: 'discord', id: '2', name: 'Dom', email: 'dom@example.com', image: undefined } as const

  function post(path: string, cookie: string, body: unknown) {
    return request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  const markSeen = (cookie: string, version: unknown) => post('/api/me/tour-seen', cookie, { version })
  const reset = (cookie: string) => post('/api/me/tour-reset', cookie, {})

  async function tourSeenOf(cookie: string) {
    const { user } = await (await request('/api/me', { headers: { cookie } })).json()
    return user.tourSeen
  }

  async function rowOf(email: string) {
    const [row] = await testDb.db.select().from(users).where(eq(users.email, email))
    return row!
  }

  it('starts a new User at 0, so they get the Tour', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    expect(await tourSeenOf(cookie)).toBe(0)
  })

  it('stores the Tour version a User has seen', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    const response = await markSeen(cookie, 1)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tourSeen: 1 })
    expect(await tourSeenOf(cookie)).toBe(1)
    expect((await rowOf(kitty.email)).tourSeen).toBe(1)
  })

  it('never lowers the number, which a newer deployment can have stored', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await testDb.db.update(users).set({ tourSeen: 5 })

    const response = await markSeen(cookie, 1)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tourSeen: 5 })
    expect((await rowOf(kitty.email)).tourSeen).toBe(5)
  })

  it('touches only the signed-in User', async () => {
    const first = await signIn(testDb.db, kitty)
    const second = await signIn(testDb.db, dom)

    await markSeen(first.cookie, 1)
    expect(await tourSeenOf(second.cookie)).toBe(0)

    await testDb.db.update(users).set({ tourSeen: 1 }).where(eq(users.email, dom.email))
    await reset(first.cookie)
    expect(await tourSeenOf(first.cookie)).toBe(0)
    expect(await tourSeenOf(second.cookie)).toBe(1)
  })

  it('sets the number back to 0, and a second reset is fine', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await markSeen(cookie, 1)

    const response = await reset(cookie)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tourSeen: 0 })
    expect(await tourSeenOf(cookie)).toBe(0)

    const again = await reset(cookie)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ tourSeen: 0 })
  })

  it('refuses a version that is no whole number from 1 up to the current Tour', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    for (const version of [0, -1, 1.5, '1', null, true, [], {}, undefined, TOUR_VERSION + 1, 2 ** 31]) {
      expect((await markSeen(cookie, version)).status, String(version)).toBe(400)
    }
    expect((await post('/api/me/tour-seen', cookie, {})).status).toBe(400)
    expect((await rowOf(kitty.email)).tourSeen).toBe(0)
  })

  it('requires sign-in', async () => {
    expect((await markSeen('', 1)).status).toBe(401)
    expect((await reset('')).status).toBe(401)
  })
})
