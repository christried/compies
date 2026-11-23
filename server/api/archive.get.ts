import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { eventMembers, events, eventTeams, roundPlaces, rounds } from '../db/schema'
import { archiveEntry, archiveResult, arrangeArchive } from '../domain/archive'
import { useClock } from '../utils/clock'
import { useDb } from '../utils/db'
import { requireUser } from '../utils/user'
import type { ArchiveView } from '../../shared/archive'

// The Archive (#882, spec #683): every finished, not deleted Event the User is a Member of, newest Finish first. It is the viewer's own
// memberships and nothing else, the Platform admin's too (ADR 0006: an Event is opened by its link, only Members). A finished Event stays
// here for good; Home lets it go after 24 h (#282). Pure rules live in server/domain/archive.ts; this handler only loads the rows.
// The Winners and the viewer's rank (#883) are derived here from the Results, once the Award ceremony has run: the rows come in a fixed
// handful of queries (four) for the whole list, and the clock is the request's, read once (ADR 0013). The read writes nothing, so no commit,
// no room message.
export default defineEventHandler(async (event): Promise<ArchiveView> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const now = useClock(event).now()

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      finishedAt: events.finishedAt,
      createdAt: events.createdAt,
      hostId: events.hostId,
      team: eventMembers.team,
      // The settings (`settingsFromRow`) and the ceremony, which the result is derived from; `gameCount` here is the planned count.
      format: events.format,
      teamCount: events.teamCount,
      teamSize: events.teamSize,
      gameCount: events.gameCount,
      pointsTable: events.pointsTable,
      selectionMode: events.selectionMode,
      hiddenWheel: events.hiddenWheel,
      vetoAllowance: events.vetoAllowance,
      poolPreview: events.poolPreview,
      ceremonyShown: events.ceremonyShown,
      ceremonyStartsAt: events.ceremonyStartsAt,
      ceremonyGag: events.ceremonyGag,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(and(eq(eventMembers.userId, user.id), eq(events.phase, 'finished'), isNull(events.deletedAt)))

  if (rows.length === 0) return { events: [] }
  const eventIds = rows.map(row => row.id)

  // A game is a Round with a Result; a Round set but never played does not count. The Places come with it (a Round whose Result has no Places
  // still counts as a game), one row per Place, so a Round is counted once however many Places it has.
  const resultRows = await db
    .select({ eventId: rounds.eventId, roundId: rounds.id, team: roundPlaces.team, place: roundPlaces.place })
    .from(rounds)
    .leftJoin(roundPlaces, eq(roundPlaces.roundId, rounds.id))
    .where(and(inArray(rounds.eventId, eventIds), isNotNull(rounds.resultAt)))

  const memberRows = await db
    .select({ eventId: eventMembers.eventId, team: eventMembers.team, teamWord: eventMembers.teamWord, teamJoinedAt: eventMembers.teamJoinedAt })
    .from(eventMembers)
    .where(inArray(eventMembers.eventId, eventIds))

  // The stored Team names: rows exist only for an Event finished before 0.12 (the Finish deletes them since).
  const storedRows = await db
    .select({ eventId: eventTeams.eventId, position: eventTeams.position, frozenName: eventTeams.frozenName })
    .from(eventTeams)
    .where(inArray(eventTeams.eventId, eventIds))

  // Each list split by Event once, so an entry reads only its own rows.
  const resultsOf = Map.groupBy(resultRows, round => round.eventId)
  const membersOf = Map.groupBy(memberRows, member => member.eventId)
  const storedOf = Map.groupBy(storedRows, stored => stored.eventId)

  const items = rows.map((row) => {
    const results = resultsOf.get(row.id) ?? []
    // The Places of each Round with a Result: one list per Round, as the Event page's Standings take them.
    const groups = [...Map.groupBy(results, round => round.roundId).values()]
      .map(places => places.flatMap(place => place.team === null || place.place === null ? [] : [{ team: place.team, place: place.place }]))
    const members = membersOf.get(row.id) ?? []
    return {
      entry: archiveEntry({
        row,
        gameCount: groups.length,
        memberCount: members.length,
        viewerId: user.id,
        result: archiveResult({ row, groups, members, stored: storedOf.get(row.id) ?? [], now }),
      }),
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
    }
  })

  return { events: arrangeArchive(items).map(item => item.entry) }
})
