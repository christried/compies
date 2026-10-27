import { SIGN_IN_PATH } from '~/utils/auth-guard'
import type { AuthUser } from '~~/shared/auth'

/** The signed-in User, null when signed out. The auth middleware loads it once per page load. */
export function useAuthUser() {
  return useState<AuthUser | null>('auth-user', () => null)
}

/** Ends the login session and goes to sign-in. */
export function useSignOut() {
  const user = useAuthUser()
  return async () => {
    await $fetch('/api/auth/sign-out', { method: 'POST', body: {} })
    user.value = null
    await navigateTo(SIGN_IN_PATH)
  }
}
