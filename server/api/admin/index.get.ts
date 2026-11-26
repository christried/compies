import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { authAccounts, eventMembers, events, sessions, users } from '../../db/schema'
import { adminEvents, adminUsers } from '../../domain/admin'
import { requirePlatformAdmin } from '../../utils/admin'
import { useDb } from '../../utils/db'
import { LIVE_PHASES } from '../../utils/library'
import { sessionNotRemoved } from '../../utils/sessions'
import type { AdminView } from '../../../shared/admin'

// The Admin page's one read (#682, spec #938): the Users who are not deleted, newest first, how many Deleted Users there are, and (#876) every Event, Deleted Events
// included, newest first. A fixed handful of queries (eight) for the whole page, grouped in code (`adminUsers`, `adminEvents`), never one read per row. Only the columns
// the lists show are selected, never `name`, `email` or a token of a User, and of an Event only what its entry shows, so none can slip into the answer (ADR 0008,
// ADR 0006). The Platform admin's own requests change nothing and publish nothing (ADR 0013).
export default defineEventHandler(async (event): Promise<AdminView> => {
  const admin = await requirePlatformAdmin(event)
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

  // Every Event, Deleted Events included (#876). The Events of a Deleted User are gone with the deletion (ADR 0020), so there is nothing to leave out here. The Host's
  // Display name is the only column of a User read; the slug is read to build the address and never leaves `adminEvents` but there.
  const eventRows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      hostDisplayName: users.displayName,
      phase: events.phase,
      createdAt: events.createdAt,
      finishedAt: events.finishedAt,
      deletedAt: events.deletedAt,
    })
    .from(events)
    .innerJoin(users, eq(events.hostId, users.id))

  const memberRows = await db.select({ eventId: eventMembers.eventId, n: count() }).from(eventMembers).groupBy(eventMembers.eventId)
  const sessionRows = await db.select({ eventId: sessions.eventId, n: count() }).from(sessions).where(sessionNotRemoved).groupBy(sessions.eventId)
  const own = await db.select({ eventId: eventMembers.eventId }).from(eventMembers).where(eq(eventMembers.userId, admin.id))

  return {
    users: adminUsers({ rows, accounts, openEvents: new Map(hosted.map(entry => [entry.hostId, entry.n])) }),
    deletedUsers: deleted!.n,
    events: adminEvents({
      rows: eventRows,
      members: new Map(memberRows.map(entry => [entry.eventId, entry.n])),
      sessions: new Map(sessionRows.map(entry => [entry.eventId, entry.n])),
      memberOf: new Set(own.map(entry => entry.eventId)),
    }),
  }
})
