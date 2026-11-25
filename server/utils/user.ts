import { eq } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { appendResponseHeader, createError, type H3Event } from 'h3'
import { users } from '../db/schema'
import { profilePicture, type AuthUser } from '../../shared/auth'
import { useAuth } from './auth'
import { useDb } from './db'

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
} satisfies Record<keyof AuthUser | 'profileImageKey', AnyPgColumn>

/** The AuthUser of a row read with `userRowColumns`: the key is dropped and `image` is the picture shown, the uploaded one else the provider's (#678). */
export function authUserOf({ profileImageKey, ...row }: AuthUser & { profileImageKey: string | null }): AuthUser {
  return { ...row, image: profilePicture({ image: row.image, profileImageKey }) }
}

/**
 * The signed-in User, or null. Permissions are read from the database on every call, never from
 * the login session, so a revoked right applies immediately (ADR 0002).
 */
export async function getUser(event: H3Event): Promise<AuthUser | null> {
  // Better Auth renews an older login session here and returns the new cookie only with returnHeaders.
  const { headers, response: authSession } = await useAuth(event).api.getSession({ headers: event.headers, returnHeaders: true })
  for (const cookie of headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie)
  if (!authSession) return null
  const [row] = await useDb(event).select(userRowColumns).from(users).where(eq(users.id, authSession.user.id))
  return row ? authUserOf(row) : null
}

/** The signed-in User; answers 401 otherwise. */
export async function requireUser(event: H3Event) {
  const user = await getUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign-in required' })
  return user
}
