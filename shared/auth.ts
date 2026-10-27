// Sign-in facts the app and the server share.

export const SIGN_IN_PROVIDERS = ['discord', 'twitch'] as const

export type SignInProvider = typeof SIGN_IN_PROVIDERS[number]

export function isSignInProvider(value: unknown): value is SignInProvider {
  return (SIGN_IN_PROVIDERS as readonly unknown[]).includes(value)
}

/** A Display name has 1–32 characters after trimming; an emoji counts as one. */
export const DISPLAY_NAME_MAX = 32

/**
 * The signed-in User as the app knows them: what `GET /api/me` and profile setup answer, and what `getUser`
 * reads (server/utils/user.ts). The email is never exposed (ADR 0008).
 */
export interface AuthUser {
  id: string
  name: string
  image: string | null
  displayName: string | null
  canHost: boolean
  isAdmin: boolean
}

/** What `GET /api/me` returns: the signed-in User, or null when signed out. */
export interface MeView {
  user: AuthUser | null
}

/** What `POST /api/profile/setup` returns: the User with the Display name just saved. */
export interface SavedProfile {
  user: AuthUser
}
