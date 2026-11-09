import { characterCount } from './text'

// Sign-in facts the app and the server share.

export const SIGN_IN_PROVIDERS = ['discord', 'twitch'] as const

export type SignInProvider = typeof SIGN_IN_PROVIDERS[number]

export function isSignInProvider(value: unknown): value is SignInProvider {
  return (SIGN_IN_PROVIDERS as readonly unknown[]).includes(value)
}

/** A User's Appearance (GLOSSARY): Hell, Dunkel or System; light unless they choose otherwise (#401). */
export const APPEARANCES = ['light', 'dark', 'system'] as const

export type Appearance = typeof APPEARANCES[number]

export function isAppearance(value: unknown): value is Appearance {
  return (APPEARANCES as readonly unknown[]).includes(value)
}

/** The cookie that keeps a device's Appearance for the signed-out pages (#403): `dark` or `system`, never `light`. */
export const APPEARANCE_COOKIE = 'compies-appearance'

/** What the cookie holds for an Appearance: its value for Dunkel and System, none for Hell (#403). */
export function appearanceCookieValue(appearance: Appearance): 'dark' | 'system' | null {
  return appearance === 'light' ? null : appearance
}

/** A Display name has 1–32 characters after trimming; an emoji counts as one. */
export const DISPLAY_NAME_MAX = 32

/** The Display name to store: trimmed, 1–32 characters (emoji count as one). Null when invalid. */
export function parseDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  const length = characterCount(name)
  return length >= 1 && length <= DISPLAY_NAME_MAX ? name : null
}

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
  /** The newest Release the User has seen in „Was ist neu“ (#184); null before any. */
  newsSeen: string | null
  /** The User's Appearance (#401); light for every User who never chose. */
  appearance: Appearance
}

/** The name a User is shown with: the Display name once they set one, else the provider name (one rule for Home, the menu, Event members, hosts and game creators). */
export function shownName({ name, displayName }: { name: string, displayName?: string | null }): string {
  return displayName ?? name
}

/** What `GET /api/me` returns: the signed-in User, or null when signed out. */
export interface MeView {
  user: AuthUser | null
}

/** What `POST /api/me/news-seen` returns: the newest Release the User has seen now (#184). */
export interface SavedNewsSeen {
  newsSeen: string
}

/** What POST /api/me/appearance returns: the Appearance just saved (#401). */
export interface SavedAppearance {
  appearance: Appearance
}

/** What `POST /api/profile/setup` returns, at setup and on a rename from the Profil page (#399): the User with the Display name just saved. */
export interface SavedProfile {
  user: AuthUser
}
