import type { AuthUser } from '~~/shared/auth'
import { TOUR_VERSION } from '~~/shared/tour'

export const kitty: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'kitty_tv',
  image: null,
  displayName: 'Kitty',
  canHost: false,
  isAdmin: false,
  newsSeen: null,
  appearance: 'light',
  // Has seen the Tour, so no component test of kitty opens it; a Tour test seeds 0 itself (#646).
  tourSeen: TOUR_VERSION,
}

/** Seeds what the auth middleware would load from `GET /api/me`; null signs out. */
export function signInAs(user: AuthUser | null) {
  useAuthUser().value = user
  useState('auth-user-loaded').value = true
}
