import type { H3Event } from 'h3'
import type { AuthUser } from '../../shared/auth'
import { apiNotFound } from './errors'
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
