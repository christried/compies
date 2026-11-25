import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { appendResponseHeader, createError, type H3Event } from 'h3'
import { users } from '../db/schema'
import { profilePicture, type AuthUser } from '../../shared/auth'
import { useAuth } from './auth'
import { useDb, type Db } from './db'
import { liveUser } from './live-user'

/**
 * What the app reads of the signed-in User's row: the columns of AuthUser plus the key of the uploaded Profile picture (#678), no more and
 * no fewer, so a new column (the email above all) cannot slip into an answer (ADR 0008). `authUserOf` turns the row into the AuthUser.
 */
export const userRowColumns = {
  id: users.id,
  name: users.name,
  image: users.image,
  displayName: users.displayName,
  canHost: users.canHost,
  isAdmin: users.isAdmin,
  newsSeen: users.newsSeen,
  appearance: users.appearance,
  tourSeen: users.tourSeen,
  profileImageKey: users.profileImageKey,
} satisfies Record<Exclude<keyof AuthUser, 'hasOwnImage'> | 'profileImageKey', AnyPgColumn>

/**
 * The AuthUser of a row read with `userRowColumns`: the key is dropped and `image` is the picture shown, the uploaded one else the provider's (#678).
 * `hasOwnImage` tells the card whether that picture is the User's own (#911); the key itself stays out of the AuthUser (ADR 0008).
 */
export function authUserOf({ profileImageKey, ...row }: Omit<AuthUser, 'hasOwnImage'> & { profileImageKey: string | null }): AuthUser {
  return { ...row, image: profilePicture({ image: row.image, profileImageKey }), hasOwnImage: profileImageKey !== null }
}

/**
 * The signed-in User, or null. Permissions are read from the database on every call, never from
 * the login session, so a revoked right applies immediately (ADR 0002). A Deleted User's row reads as no User: a session row that an OAuth callback in
 * flight inserted after the deletion signs nobody in (#991).
 */
export async function getUser(event: H3Event): Promise<AuthUser | null> {
  // Better Auth renews an older login session here and returns the new cookie only with returnHeaders.
  const { headers, response: authSession } = await useAuth(event).api.getSession({ headers: event.headers, returnHeaders: true })
  for (const cookie of headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie)
  if (!authSession) return null
  const [row] = await useDb(event).select(userRowColumns).from(users).where(liveUser(authSession.user.id))
  return row ? authUserOf(row) : null
}

/** The answer of a request without a signed-in User, and of a write whose User was deleted meanwhile (#991). */
export function signInRequired() {
  return createError({ statusCode: 401, statusMessage: 'Sign-in required' })
}

/**
 * The live check of a write that inserts a row naming the User (#991, ADR 0020, `CODING_STANDARDS.md` § Database): `FOR KEY SHARE` on the User's row while it is
 * not deleted, so a running deletion (which holds the row `FOR UPDATE`) is waited for and its committed mark is read, and a deletion that starts later waits for
 * this write. Called after the write's Event locks and before its first insert; answers 401 (`requireUser`'s answer) for a Deleted User.
 */
export async function assertLiveUser(tx: Db, userId: string): Promise<void> {
  const [row] = await tx.select({ id: users.id }).from(users).where(liveUser(userId)).for('key share')
  if (!row) throw signInRequired()
}

/** The signed-in User; answers 401 otherwise. */
export async function requireUser(event: H3Event) {
  const user = await getUser(event)
  if (!user) throw signInRequired()
  return user
}
