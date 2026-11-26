import { eq } from 'drizzle-orm'
import { getRouterParam, type H3Event } from 'h3'
import type { AuthUser } from '../../shared/auth'
import { users } from '../db/schema'
import { isUuid } from '../domain/uuid'
import { useDb } from './db'
import { apiError, apiNotFound } from './errors'
import { getUser } from './user'

/**
 * The signed-in Platform admin (#682, spec #938): the guard of every read and write of the Admin page. Anyone else, signed in or not, gets exactly the
 * answer of a missing route (`server/api/[...].ts`), so no answer tells that the page exists; the Construction rule hides the page from them the same way
 * (`canSeeAdmin`). The flags are read from the database on every call, never from the login session (ADR 0002), so a taken admin mark shuts the page at once.
 */
export async function requirePlatformAdmin(event: H3Event): Promise<AuthUser> {
  const user = await getUser(event)
  if (!user?.isAdmin) throw apiNotFound()
  return user
}

/**
 * The route's `:id` as the Admin routes that name one User read it (#682, #940, #941): text that is no id answers like a missing route, so the id never reaches a query.
 */
export function adminUserIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!isUuid(id)) throw apiNotFound()
  return id
}

/**
 * The id of the User whose account the Platform admin may delete (#941, spec #938): the route's `:id`. Text that is no id, an unknown id and a Deleted User answer like a
 * missing route; a Platform admin's id, the signed-in admin's own included, answers `platform_admin_not_deletable`, so no route that deletes can be pointed at one.
 */
export async function requireDeletableUserId(event: H3Event): Promise<string> {
  const id = adminUserIdParam(event)
  const [row] = await useDb(event).select({ isAdmin: users.isAdmin, deletedAt: users.deletedAt }).from(users).where(eq(users.id, id))
  if (!row || row.deletedAt) throw apiNotFound()
  if (row.isAdmin) throw apiError('platform_admin_not_deletable')
  return id
}
