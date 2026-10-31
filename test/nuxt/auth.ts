import type { AuthUser } from '~~/shared/auth'

export const kitty: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'kitty_tv',
  image: null,
  displayName: 'Kitty',
  canHost: false,
  isAdmin: false,
  newsSeen: null,
}

/** Seeds what the auth middleware would load from `GET /api/me`; null signs out. */
export function signInAs(user: AuthUser | null) {
  useAuthUser().value = user
  useState('auth-user-loaded').value = true
}
