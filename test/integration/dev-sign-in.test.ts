import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import me from '../../server/api/me.get'
import devSignIn from '../../server/dev/sign-in'
import { users } from '../../server/db/schema'
import type { MeView } from '../../shared/auth'
import { version as current } from '../../package.json'
import { createTestDb, createTestServer } from './harness'
import { stubAuthEnv } from './sign-in'

// The sign-in for `pnpm dev` (retro 1.3): a real Better Auth login session for a fixed Dev User.
// Each case migrates a fresh database and signs in through Better Auth, which takes longer than vitest's 5 s
// default while the whole suite runs in parallel (it timed out in CI on #194).
describe('dev sign-in', { timeout: 20_000 }, () => {
  beforeEach(() => stubAuthEnv())

  async function signInAs(query: string, db?: Awaited<ReturnType<typeof createTestDb>>['db']) {
    const database = db ?? (await createTestDb()).db
    const server = createTestServer(database, { 'GET /api/dev/sign-in': devSignIn, 'GET /api/me': me })
    const response = await server(`/api/dev/sign-in${query}`, { redirect: 'manual' })
    const cookie = response.headers.getSetCookie().map(header => header.split(';')[0]).join('; ')
    const view = await (await server('/api/me', { headers: { cookie } })).json() as MeView
    return { response, user: view.user, server, cookie }
  }

  it('signs in as the Dev Host with the Host permission and lands on `to`', async () => {
    const { response, user } = await signInAs('?as=host&to=/bibliothek')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/bibliothek')
    expect(user).toMatchObject({ displayName: 'Dev Host', canHost: true, isAdmin: false })
  })

  it('signs in as a Member without the Host permission', async () => {
    const { user } = await signInAs('?as=member')

    expect(user).toMatchObject({ displayName: 'Dev Member', canHost: false, isAdmin: false, image: '/icons/icon-192.png' })
  })

  it('signs in as the Platform admin', async () => {
    const { user } = await signInAs('?as=admin')

    expect(user).toMatchObject({ canHost: true, isAdmin: true })
  })

  // The Dev Users see the current „Was ist neu“ as seen on every sign-in, not only the first (review 0.5.1 T2): a
  // Release that ships between two sign-ins must not open the pop-up on the dev server.
  it('marks the news seen on every sign-in, so a Release never opens the pop-up', async () => {
    const { db } = await createTestDb()
    await signInAs('?as=host', db)
    await db.update(users).set({ newsSeen: '0.1.0' }).where(eq(users.email, 'host@dev.compies.invalid'))

    const { user } = await signInAs('?as=host', db)

    expect(user).toMatchObject({ newsSeen: current })
  })

  // `?news=unseen` is the one check that wants the pop-up: it stores null on the first sign-in and on a later one.
  it('leaves the news unseen with `?news=unseen`, on the first sign-in and on a later one', async () => {
    const { db } = await createTestDb()
    const first = await signInAs('?as=host&news=unseen', db)
    expect(first.user).toMatchObject({ newsSeen: null })

    await signInAs('?as=host', db)
    const later = await signInAs('?as=host&news=unseen', db)
    expect(later.user).toMatchObject({ newsSeen: null })
  })

  it('lands on Home for a `to` outside the app', async () => {
    for (const to of ['https://example.org', '//example.org']) {
      const { response } = await signInAs(`?to=${encodeURIComponent(to)}`)
      expect(response.headers.get('location')).toBe('/')
    }
  })

  it('answers the API 404 on a production server', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { response, user } = await signInAs('?as=admin')

    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(user).toBeNull()
  })
})
