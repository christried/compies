import { SIGN_IN_PATH } from '~/utils/auth-guard'
import { APPEARANCE_COOKIE, type AuthUser } from '~~/shared/auth'

/** The signed-in User, null when signed out. The auth middleware loads it once per page load. */
export function useAuthUser() {
  return useState<AuthUser | null>('auth-user', () => null)
}

/** Ends the login session and goes to sign-in. */
export function useSignOut() {
  const user = useAuthUser()
  return async () => {
    await $fetch('/api/auth/sign-out', { method: 'POST', body: {} })
    // The Appearance route set the device's cookie while the User was signed in; the plugin's ref follows it through the
    // CookieStore, and only through this call in a browser without one, so the sign-in page keeps the look (#403).
    refreshCookie(APPEARANCE_COOKIE)
    user.value = null
    await navigateTo(SIGN_IN_PATH)
  }
}
