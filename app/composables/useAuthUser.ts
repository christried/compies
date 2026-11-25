import { SIGN_IN_PATH } from '~/utils/auth-guard'
import { ARCHIVE_KEY } from '~/utils/event-data'
import { APPEARANCE_COOKIE } from '~~/shared/appearance'
import type { AuthUser } from '~~/shared/auth'

/** The signed-in User, null when signed out. The auth middleware loads it once per page load. */
export function useAuthUser() {
  return useState<AuthUser | null>('auth-user', () => null)
}

/**
 * The client's leave once the session is gone: the User forgotten, the signed-out User's lists dropped, then the sign-in page. `useSignOut` runs it after its
 * POST; „Konto löschen“ runs it alone, since the deletion has ended the session already (#918).
 */
export function useAfterSignOut() {
  const user = useAuthUser()
  return async () => {
    // The Appearance route set the device's cookie while the User was signed in; the plugin's ref follows it through the
    // CookieStore, and only through this call in a browser without one, so the sign-in page keeps the look (#403).
    refreshCookie(APPEARANCE_COOKIE)
    user.value = null
    clearNuxtData(ARCHIVE_KEY) // the Archive keeps its list for the way back (#984); it is the signed-out User's
    await navigateTo(SIGN_IN_PATH)
  }
}

/** Ends the login session and goes to sign-in. */
export function useSignOut() {
  const afterSignOut = useAfterSignOut()
  return async () => {
    await $fetch('/api/auth/sign-out', { method: 'POST', body: {} })
    await afterSignOut()
  }
}
