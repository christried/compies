import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import me from '../../server/api/me.get'
import newsSeen from '../../server/api/me/news-seen.post'
import { users } from '../../server/db/schema'
import { version as current } from '../../package.json'
import { createTestDb, createTestServer } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// „Was ist neu“ is shown once per User, not once per device (#184): the newest Release a User has seen
// lives on the User.
describe('the Releases a User has seen', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, { 'GET /api/me': me, 'POST /api/me/news-seen': newsSeen })
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

  function markSeen(cookie: string, version: unknown) {
    return request('/api/me/news-seen', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ version }),
    })
  }

  async function seenOf(cookie: string) {
    const { user } = await (await request('/api/me', { headers: { cookie } })).json()
    return user.newsSeen
  }

  it('starts a new User at the current Release, so they get no pop-up for news from before they came', async () => {
    const { cookie } = await signIn(testDb.db, kitty)

    expect(await seenOf(cookie)).toBe(current)
  })

  it('keeps the current Release for a returning User, who signs in again', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await testDb.db.update(users).set({ newsSeen: '0.1.0' })

    await signIn(testDb.db, kitty)

    expect(await seenOf(cookie)).toBe('0.1.0')
  })

  it('stores the Release a User has seen', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await testDb.db.update(users).set({ newsSeen: null })

    const response = await markSeen(cookie, '0.1.0')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ newsSeen: '0.1.0' })
    expect(await seenOf(cookie)).toBe('0.1.0')
  })

  it('never moves back to an older Release', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await testDb.db.update(users).set({ newsSeen: '0.3.0' })

    const response = await markSeen(cookie, '0.2.0')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ newsSeen: '0.3.0' })
    expect(await seenOf(cookie)).toBe('0.3.0')
  })

  it('refuses a version that is no Release', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    await testDb.db.update(users).set({ newsSeen: null })

    for (const version of ['9.9.9', '1.4.0', 'latest', '1.2', '', 42, undefined]) {
      expect((await markSeen(cookie, version)).status, String(version)).toBe(400)
    }
    const [row] = await testDb.db.select().from(users).where(eq(users.email, kitty.email))
    expect(row!.newsSeen).toBeNull()
  })

  it('requires sign-in', async () => {
    expect((await markSeen('', current)).status).toBe(401)
  })
})
