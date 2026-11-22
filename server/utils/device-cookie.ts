import type { H3Event } from 'h3'
import { useAuth } from './auth'

// The attributes of a cookie that keeps a device's setting the page reads: the Appearance's (#403) and Reduced motion's (#680).
/** One year, in seconds. */
export const ONE_YEAR = 365 * 24 * 60 * 60

/** Path `/`, `SameSite=Lax`, Secure as the login session cookie is, readable by the page (not HttpOnly). */
export async function deviceCookieOptions(event: H3Event) {
  // Secure as the login session cookie is: Better Auth decides from BETTER_AUTH_URL. The request can't tell, since the auth
  // middleware calls GET /api/me with only the cookie header on a server-side load. Not HttpOnly: the page reads it.
  const { attributes } = (await useAuth(event).$context).authCookies.sessionToken
  return { path: '/', sameSite: 'lax', secure: attributes.secure ?? false } as const
}
