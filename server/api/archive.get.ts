import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { eventMembers, events, rounds } from '../db/schema'
import { archiveEntry, arrangeArchive } from '../domain/archive'
import { useDb } from '../utils/db'
import { requireUser } from '../utils/user'
import type { ArchiveView } from '../../shared/archive'

// The Archive (#882, spec #683): every finished, not deleted Event the User is a Member of, newest Finish first. It is the viewer's own
// memberships and nothing else, the Platform admin's too (ADR 0006: an Event is opened by its link, only Members). A finished Event stays
// here for good; Home lets it go after 24 h (#282). Pure rules live in server/domain/archive.ts; this handler only loads the rows.
export default defineEventHandler(async (event): Promise<ArchiveView> => {
  const user = await requireUser(event)
  const db = useDb(event)

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      finishedAt: events.finishedAt,
      createdAt: events.createdAt,
      hostId: events.hostId,
      teamCount: events.teamCount,
      teamSize: events.teamSize,
      team: eventMembers.team,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(and(eq(eventMembers.userId, user.id), eq(events.phase, 'finished'), isNull(events.deletedAt)))

  if (rows.length === 0) return { events: [] }
  const eventIds = rows.map(row => row.id)

  // A game is a Round with a Result; a Round set but never played does not count.
  const resultRows = await db
    .select({ eventId: rounds.eventId })
    .from(rounds)
    .where(and(inArray(rounds.eventId, eventIds), isNotNull(rounds.resultAt)))

  const memberRows = await db
    .select({ eventId: eventMembers.eventId })
    .from(eventMembers)
    .where(inArray(eventMembers.eventId, eventIds))

  // Each list split by Event once, so an entry reads only its own rows.
  const resultsOf = Map.groupBy(resultRows, round => round.eventId)
  const membersOf = Map.groupBy(memberRows, member => member.eventId)

  const items = rows.map(row => ({
    entry: archiveEntry({
      row,
      gameCount: resultsOf.get(row.id)?.length ?? 0,
      memberCount: membersOf.get(row.id)?.length ?? 0,
      viewerId: user.id,
    }),
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  }))

  return { events: arrangeArchive(items).map(item => item.entry) }
})
