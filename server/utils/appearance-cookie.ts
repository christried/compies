import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'
import { APPEARANCE_COOKIE, appearanceCookieValue, type Appearance } from '../../shared/auth'
import { useAuth } from './auth'

// The Appearance cookie (#403, GLOSSARY: Appearance): mirrors a signed-in User's Dunkel or System on this device, so the
// signed-out pages keep the look. Only the server writes it: the Appearance route and GET /api/me. Sign-out leaves it.
const ONE_YEAR = 365 * 24 * 60 * 60

/** Sets the cookie for Dunkel and System, removes it for Hell. */
export async function writeAppearanceCookie(event: H3Event, appearance: Appearance): Promise<void> {
  // Secure as the login session cookie is: Better Auth decides from BETTER_AUTH_URL. The request can't tell, since the auth
  // middleware calls GET /api/me with only the cookie header on a server-side load. Not HttpOnly: the page reads it.
  const { attributes } = (await useAuth(event).$context).authCookies.sessionToken
  const options = { path: '/', sameSite: 'lax', secure: attributes.secure ?? false } as const
  const value = appearanceCookieValue(appearance)
  if (value) setCookie(event, APPEARANCE_COOKIE, value, { ...options, maxAge: ONE_YEAR })
  else deleteCookie(event, APPEARANCE_COOKIE, options)
}

/** Writes the cookie only when the device's disagrees with the User's Appearance (another User's, a missing one). */
export async function correctAppearanceCookie(event: H3Event, appearance: Appearance): Promise<void> {
  if ((getCookie(event, APPEARANCE_COOKIE) ?? null) !== appearanceCookieValue(appearance)) {
    await writeAppearanceCookie(event, appearance)
  }
}
