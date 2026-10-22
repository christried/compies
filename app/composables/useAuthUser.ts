import { SIGN_IN_PATH } from '~/utils/auth-guard'

/** The signed-in User as `GET /api/me` returns it. */
export interface AuthUser {
  id: string
  name: string
  image: string | null
  displayName: string | null
  canHost: boolean
  isAdmin: boolean
}

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
