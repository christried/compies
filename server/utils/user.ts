import { eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { users } from '../db/schema'
import { useAuth } from './auth'
import { useDb } from './db'

/** What the app knows about the signed-in User. The email is never exposed (ADR 0008). */
export const userColumns = {
  id: users.id,
  name: users.name,
  image: users.image,
  displayName: users.displayName,
  canHost: users.canHost,
  isAdmin: users.isAdmin,
}

/**
 * The signed-in User, or null. Permissions are read from the database on every call, never from
 * the login session, so a revoked right applies immediately (ADR 0002).
 */
export async function getUser(event: H3Event) {
  const authSession = await useAuth(event).api.getSession({ headers: event.headers })
  if (!authSession) return null
  const [user] = await useDb(event).select(userColumns).from(users).where(eq(users.id, authSession.user.id))
  return user ?? null
}

/** The signed-in User; answers 401 otherwise. */
export async function requireUser(event: H3Event) {
  const user = await getUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign-in required' })
  return user
}
