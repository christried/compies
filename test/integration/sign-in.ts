import { and, eq } from 'drizzle-orm'
import { vi } from 'vitest'
import auth from '../../server/api/auth/[...all]'
import { authAccounts } from '../../server/db/schema'
import { createAuth } from '../../server/utils/auth'
import type { Db } from '../../server/utils/db'
import { createTestServer } from './harness'

/** What Discord or Twitch reports about the User signing in. */
export interface ProviderProfile {
  provider: 'discord' | 'twitch'
  id: string
  name: string
  email?: string | null
  /** Whether the provider vouches for the email; defaults to true when there is one. */
  emailVerified?: boolean
  image?: string
}

/** The env Better Auth needs, without real provider apps. Call from `beforeEach`; Vitest restores it. */
export function stubAuthEnv(allowlist: { hosts?: string, admins?: string } = {}) {
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost')
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-that-is-at-least-32-characters-long')
  for (const name of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET']) {
    vi.stubEnv(name, 'test')
  }
  setAllowlist(allowlist)
}

export function setAllowlist({ hosts = '', admins = '' }: { hosts?: string, admins?: string }) {
  vi.stubEnv('HOST_PROVIDER_IDS', hosts)
  vi.stubEnv('ADMIN_PROVIDER_IDS', admins)
}

/** Twitch identifies the User through an ID token; Better Auth only decodes it. */
function unsignedJwt(claims: Record<string, unknown>) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.`
}

/** Answers Better Auth's calls to the provider's token and profile endpoints. */
function stubProvider(profile: ProviderProfile) {
  const tokens = { access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', expires_in: 3600 }
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = decodeURIComponent(input instanceof Request ? input.url : input.toString())
    if (url === 'https://discord.com/api/oauth2/token') return Response.json(tokens)
    if (url === 'https://discord.com/api/users/@me') {
      return Response.json({
        id: profile.id, username: profile.name, global_name: profile.name, discriminator: '0',
        avatar: null, email: profile.email ?? null, verified: profile.emailVerified ?? !!profile.email,
      })
    }
    if (url === 'https://id.twitch.tv/oauth2/token') {
      return Response.json({
        ...tokens,
        id_token: unsignedJwt({
          sub: profile.id, preferred_username: profile.name, picture: profile.image,
          email: profile.email ?? null, email_verified: profile.emailVerified ?? !!profile.email,
        }),
      })
    }
    throw new Error(`Unexpected fetch in test: ${url}`)
  }))
}

function cookiesFrom(response: { headers: Headers }) {
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
}

/** Merges cookie headers like a browser jar: a later cookie replaces an earlier one of the same name. */
function joinCookies(...headers: (string | undefined)[]) {
  const jar = new Map<string, string>()
  for (const pair of headers.flatMap(header => header ? header.split('; ') : [])) {
    jar.set(pair.slice(0, pair.indexOf('=')), pair)
  }
  return [...jar.values()].join('; ')
}

export function createAuthServer(db: Db) {
  return createTestServer(db, { 'GET /api/auth/**': auth, 'POST /api/auth/**': auth })
}

/** Where the provider sends the browser, and the cookies that came with it. */
interface OAuthStart { url: string, cookie: string }

/**
 * The full OAuth round trip, with the provider stubbed: `start` sends the browser off to the
 * provider, which comes back to Better Auth's callback with a code. Returns the cookies the
 * callback sets and where it redirects.
 */
async function oauthRoundTrip(db: Db, profile: ProviderProfile, start: () => Promise<OAuthStart>, cookie?: string) {
  stubProvider(profile)
  try {
    const { url, cookie: startCookie } = await start()
    const state = new URL(url).searchParams.get('state')!
    const callback = await createAuthServer(db)(`/api/auth/callback/${profile.provider}?code=code&state=${state}`, {
      headers: { cookie: joinCookies(cookie, startCookie) },
      redirect: 'manual',
    })
    return { cookie: cookiesFrom(callback), location: callback.headers.get('location') }
  }
  finally {
    vi.unstubAllGlobals()
  }
}

/** Signs in as the provider account. Returns the login session cookie header and the redirect. */
export function signIn(db: Db, profile: ProviderProfile, callbackURL = '/') {
  return oauthRoundTrip(db, profile, async () => {
    const response = await createAuthServer(db)('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'http://localhost' },
      body: JSON.stringify({ provider: profile.provider, callbackURL }),
    })
    return { url: ((await response.json()) as { url: string }).url, cookie: cookiesFrom(response) }
  })
}

// Linking a second provider comes with T2b, and its HTTP routes stay closed until then, so these
// call Better Auth's server API. The account hooks fire all the same.

/** Links a second provider account to the signed-in User. */
export function linkAccount(db: Db, cookie: string, profile: ProviderProfile) {
  return oauthRoundTrip(db, profile, async () => {
    const { headers, response } = await createAuth(db).api.linkSocialAccount({
      headers: new Headers({ cookie }),
      body: { provider: profile.provider, callbackURL: '/' },
      returnHeaders: true,
    })
    return { url: response.url, cookie: cookiesFrom({ headers }) }
  }, cookie)
}

export async function unlinkAccount(db: Db, cookie: string, profile: ProviderProfile) {
  const [account] = await db.select({ id: authAccounts.id }).from(authAccounts)
    .where(and(eq(authAccounts.providerId, profile.provider), eq(authAccounts.accountId, profile.id)))
  return createAuth(db).api.unlinkAccount({ headers: new Headers({ cookie }), body: { accountId: account!.id } })
}
