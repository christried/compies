import { and, count, inArray, isNotNull, isNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { authAccounts, events, users } from '../../db/schema'
import { adminUsers } from '../../domain/admin'
import { requirePlatformAdmin } from '../../utils/admin'
import { useDb } from '../../utils/db'
import { LIVE_PHASES } from '../../utils/library'
import type { AdminView } from '../../../shared/admin'

// The Admin page's one read (#682, spec #938): the Users who are not deleted, newest first, and how many Deleted Users there are. 0.24-3 (#876) adds the Events
// to this answer. A fixed handful of queries (four) for the whole list, grouped in code (`adminUsers`), never one read per row. Only the columns the list shows
// are selected, never `name`, `email` or a token, so none can slip into the answer (ADR 0008). The Platform admin's own requests change nothing and publish
// nothing (ADR 0013).
export default defineEventHandler(async (event): Promise<AdminView> => {
  await requirePlatformAdmin(event)
  const db = useDb(event)

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      image: users.image,
      profileImageKey: users.profileImageKey,
      createdAt: users.createdAt,
      canHost: users.canHost,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(isNull(users.deletedAt))

  const [deleted] = await db.select({ n: count() }).from(users).where(isNotNull(users.deletedAt))

  // A Deleted User's accounts are gone with the deletion, so the accounts of every User are the accounts of the listed ones.
  const accounts = await db.select({ userId: authAccounts.userId, providerId: authAccounts.providerId }).from(authAccounts)

  const hosted = await db
    .select({ hostId: events.hostId, n: count() })
    .from(events)
    .where(and(isNull(events.deletedAt), inArray(events.phase, LIVE_PHASES)))
    .groupBy(events.hostId)

  return {
    users: adminUsers({ rows, accounts, openEvents: new Map(hosted.map(entry => [entry.hostId, entry.n])) }),
    deletedUsers: deleted!.n,
  }
})
