import { and, eq, isNull } from 'drizzle-orm'
import { users } from '../db/schema'

// Its own file because `invite.ts` (which `delete-user.ts` imports) needs it, and `delete-user.ts` keeps `h3` and Nuxt auto-imports out of its graph (the
// header of delete-user.ts).

/** The User's own row while it is not deleted (#991): the `where` of every update a User makes of their own row and of every live check. */
export function liveUser(userId: string) {
  return and(eq(users.id, userId), isNull(users.deletedAt))
}
