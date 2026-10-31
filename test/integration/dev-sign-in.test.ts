import { beforeEach, describe, expect, it, vi } from 'vitest'
import me from '../../server/api/me.get'
import devSignIn from '../../server/dev/sign-in'
import type { MeView } from '../../shared/auth'
import { createTestDb, createTestServer } from './harness'
import { stubAuthEnv } from './sign-in'

// The sign-in for `pnpm dev` (retro 1.3): a real Better Auth login session for a fixed Dev User.
// Each case migrates a fresh database and signs in through Better Auth, which takes longer than vitest's 5 s
// default while the whole suite runs in parallel (it timed out in CI on #194).
describe('dev sign-in', { timeout: 20_000 }, () => {
  beforeEach(() => stubAuthEnv())

  async function signInAs(query: string) {
    const { db } = await createTestDb()
    const server = createTestServer(db, { 'GET /api/dev/sign-in': devSignIn, 'GET /api/me': me })
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
