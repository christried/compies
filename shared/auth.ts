import type { Appearance } from './appearance'
import { IMAGE_PATH } from './image'
import { characterCount } from './text'

// Sign-in facts the app and the server share.

export const SIGN_IN_PROVIDERS = ['discord', 'twitch'] as const

export type SignInProvider = typeof SIGN_IN_PROVIDERS[number]

export function isSignInProvider(value: unknown): value is SignInProvider {
  return (SIGN_IN_PROVIDERS as readonly unknown[]).includes(value)
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
  /** An uploaded Profile picture is the one shown (#911). */
  hasOwnImage: boolean
  displayName: string | null
  canHost: boolean
  isAdmin: boolean
  /** The newest Release the User has seen in „Was ist neu“ (#184); null before any. */
  newsSeen: string | null
  /** The User's Appearance (#401); light for every User who never chose. */
  appearance: Appearance
  /** The Tour version the User last saw; 0 for never (#646). */
  tourSeen: number
}

/** The name a User is shown with: the Display name once they set one, else the provider name (one rule for Home, the menu, Event members, hosts and game creators). */
export function shownName({ name, displayName }: { name: string, displayName?: string | null }): string {
  return displayName ?? name
}

/**
 * The address of the picture a User is shown with (#678, GLOSSARY: Profile picture): the uploaded one, else the provider's, else null (the
 * client draws the initial). The one function that turns a User into their picture's address.
 */
export function profilePicture({ image, profileImageKey }: { image?: string | null, profileImageKey?: string | null }): string | null {
  return profileImageKey ? `${IMAGE_PATH}${profileImageKey}` : (image ?? null)
}

/**
 * What a read shows of a User (#915, ADR 0020): the shown name and the picture (`profilePicture`, #678), or for a Deleted User an empty name, no picture and
 * `deleted: true`, cut whatever the row still holds, the uploaded picture's key included. The `deleted` key is there only for a Deleted User, so a User who is
 * not deleted comes as before. The client shows the mark as „Gelöschtes Konto“ (`shownPerson`). `profileImageKey` is required, so a read that forgets to
 * select it fails the typecheck instead of showing the provider's picture.
 */
export function readPerson({ name, displayName, image, profileImageKey, deletedAt }: { name: string, displayName?: string | null, image?: string | null, profileImageKey: string | null, deletedAt: Date | null }): { name: string, image: string | null, deleted?: true } {
  if (deletedAt !== null) return { name: '', image: null, deleted: true }
  return { name: shownName({ name, displayName }), image: profilePicture({ image, profileImageKey }) }
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

/** What POST /api/me/motion returns: whether this device's Reduced motion is on after the save (#680). */
export interface SavedMotion {
  reduced: boolean
}

/** What PUT /api/me/image returns: the address of the picture shown now, the uploaded one (#678). Never null. */
export interface SavedProfileImage {
  image: string
}

/** What DELETE /api/me/image returns: the address of the picture shown now, the provider's, or null for the initial (#911). */
export interface RemovedProfileImage {
  image: string | null
}

/** What DELETE /api/me returns: the account is deleted (#681). The session cookie is expired with it. */
export interface AccountDeleted {
  deleted: true
}

/** What POST /api/me/tour-seen and POST /api/me/tour-reset return: the Tour version stored now (#646). */
export interface SavedTourSeen {
  tourSeen: number
}

/** What `POST /api/profile/setup` returns, at setup and on a rename from the Profil page (#399): the User with the Display name just saved. */
export interface SavedProfile {
  user: AuthUser
}
