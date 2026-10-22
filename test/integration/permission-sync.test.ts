import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { authAccounts, users } from '../../server/db/schema'
import { createTestDb } from './harness'
import { createAuthServer, linkAccount, setAllowlist, signIn, stubAuthEnv, unlinkAccount, type ProviderProfile } from './sign-in'

describe('sign-in and the allowlist sync', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>

  beforeAll(async () => {
    testDb = await createTestDb()
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

  const kitty: ProviderProfile = { provider: 'discord', id: '80351110224678912', name: 'Kitty', email: 'kitty@example.com' }
  const kittyOnTwitch: ProviderProfile = { provider: 'twitch', id: '141981764', name: 'kitty_tv', email: 'kitty@example.com' }

  async function userRow(email: string) {
    const [user] = await testDb.db.select().from(users).where(eq(users.email, email))
    return user!
  }

  it('creates the User on first sign-in, with no Display name and no rights', async () => {
    const { cookie, location } = await signIn(testDb.db, kitty)

    expect(cookie).toContain('better-auth.session_token=')
    expect(location).toBe('/')
    expect(await userRow('kitty@example.com')).toMatchObject({
      name: 'Kitty', displayName: null, canHost: false, isAdmin: false,
    })
  })

  it('grants the Host permission to a listed account on sign-in', async () => {
    setAllowlist({ hosts: `discord:${kitty.id}` })

    await signIn(testDb.db, kitty)

    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: true, isAdmin: false })
  })

  it('makes a listed admin Platform admin and Host', async () => {
    setAllowlist({ admins: `twitch:${kittyOnTwitch.id}` })

    await signIn(testDb.db, kittyOnTwitch)

    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: true, isAdmin: true })
  })

  it('revokes the Host permission at the next sign-in after removal from the env', async () => {
    setAllowlist({ hosts: `discord:${kitty.id}` })
    await signIn(testDb.db, kitty)

    setAllowlist({})
    await signIn(testDb.db, kitty)

    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: false, isAdmin: false })
  })

  it('recomputes across all linked accounts', async () => {
    setAllowlist({ hosts: `twitch:${kittyOnTwitch.id}` })
    const { cookie } = await signIn(testDb.db, kitty)
    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: false })

    // Linking is explicit only (ADR 0008); the profile offers it with T2b.
    await linkAccount(testDb.db, cookie, kittyOnTwitch)
    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: true })

    // Signing in with the unlisted Discord account keeps the right the linked Twitch account grants.
    await signIn(testDb.db, kitty)
    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: true })

    await unlinkAccount(testDb.db, cookie, kittyOnTwitch)
    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: false })
  })

  it('overwrites name and image from the provider at every sign-in', async () => {
    await signIn(testDb.db, kittyOnTwitch)
    await signIn(testDb.db, { ...kittyOnTwitch, name: 'kitty_live', image: 'https://cdn.example/new.png' })

    expect(await userRow('kitty@example.com')).toMatchObject({ name: 'kitty_live', image: 'https://cdn.example/new.png' })
  })

  it('gives an account without email a placeholder address', async () => {
    await signIn(testDb.db, { provider: 'discord', id: '42', name: 'PhoneOnly', email: null })
    await signIn(testDb.db, { provider: 'twitch', id: '43', name: 'unverified' })

    expect((await userRow('42@discord.placeholder.invalid')).name).toBe('PhoneOnly')
    expect((await userRow('43@twitch.placeholder.invalid')).name).toBe('unverified')
  })

  it('serves only the endpoints the app uses: no email via get-session, no name or image edits', async () => {
    const { cookie } = await signIn(testDb.db, kitty)
    const request = createAuthServer(testDb.db)
    const headers = { 'content-type': 'application/json', 'origin': 'http://localhost', cookie }

    expect((await request('/api/auth/get-session', { headers })).status).toBe(404)
    const update = await request('/api/auth/update-user', { method: 'POST', headers, body: JSON.stringify({ name: 'Fake' }) })
    expect(update.status).toBe(404)
    const link = await request('/api/auth/link-social', { method: 'POST', headers, body: JSON.stringify({ provider: 'twitch' }) })
    expect(link.status).toBe(404)
    expect((await request('/api/auth/sign-out', { method: 'POST', headers, body: '{}' })).status).toBe(200)
    expect(await userRow('kitty@example.com')).toMatchObject({ name: 'Kitty' })
  })

  it('links a second provider with the same verified email to the existing User', async () => {
    setAllowlist({ hosts: `twitch:${kittyOnTwitch.id}` })
    await signIn(testDb.db, kitty)

    const { cookie, location } = await signIn(testDb.db, kittyOnTwitch)

    expect(cookie).toContain('better-auth.session_token=')
    expect(location).toBe('/')
    expect(await testDb.db.select().from(users)).toHaveLength(1)
    expect(await testDb.db.select().from(authAccounts)).toHaveLength(2)
    expect(await userRow('kitty@example.com')).toMatchObject({ canHost: true })
  })

  it('does not link when the existing User has an unverified email', async () => {
    await signIn(testDb.db, { ...kitty, emailVerified: false })

    const { cookie, location } = await signIn(testDb.db, kittyOnTwitch)

    expect(cookie).not.toContain('better-auth.session_token=')
    expect(location).toContain('error=account_not_linked')
    expect(await testDb.db.select().from(authAccounts)).toHaveLength(1)
  })
})
