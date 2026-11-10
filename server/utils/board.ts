import { and, desc, eq, sql } from 'drizzle-orm'
import { eventMembers, eventTeams } from '../db/schema'
import { composeTeamName, type Place } from '../../shared/board'
import { recordActivity } from './activity'
import type { Db } from './db'
import type { EventChange } from './event-access'

// The seats of the Game board (#160, GLOSSARY: Game board). One home: every change of a seat goes through seatMember,
// so a rule that follows a seat change (#161: a seat change clears the Team word; #163: removed teams send their Players
// to the Stands) has one place to live. The seats are read, and the rules that ask them answered, by the Event state
// (event-state.ts, #416). The Team word handlers write the word themselves (team-word.post.ts, reset-name.post.ts).

/**
 * Puts the Member in `to`. Entering a team (or changing team) stamps `team_joined_at` with the moment of the write,
 * leaving a team clears it. The stamp is the clock, not the transaction start, so seats taken one after the other
 * keep their order even when their transactions began together (lastToJoin reads it).
 *
 * Every seat change also clears the Member's Team word (#161): a word belongs to the team it was given in, so leaving
 * a team or changing team drops it. A move to the place the Member is in never gets here (`already_there`), so a
 * Player keeps their word until they really move. Callers that send Players away (#163: removed teams) get this too.
 */
export async function seatMember(tx: Db, eventId: string, userId: string, to: Place): Promise<void> {
  const team = to.zone === 'team' ? to.team : null
  await tx
    .update(eventMembers)
    .set({ zone: to.zone, team, teamJoinedAt: team === null ? null : sql`clock_timestamp()`, teamWord: null })
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
}

/**
 * One Member's seat change as the Game board makes it (#160, #163): the seat, its feed entry, and `member.moved` after the
 * commit. The move endpoint and the lowering of the team count (the removed teams' Players go to the Stands, in the Host's
 * name) both end here, so a move reads the same wherever it came from. The rules that allow it are the caller's.
 */
export async function moveMember(tx: Db, publish: EventChange['publish'], now: Date, eventId: string, actorId: string, userId: string, from: Place, to: Place): Promise<void> {
  await seatMember(tx, eventId, userId, to)
  await recordActivity(tx, publish, eventId, { type: 'member_moved', actorId, params: { userId, from, to }, now: now })
  publish({ type: 'member.moved', userId, from, to, by: actorId })
}

/** The Player who took a seat in the team most recently, or null for an empty team: the winner of a lost race. */
export async function lastToJoin(tx: Db, eventId: string, team: number): Promise<string | null> {
  const [row] = await tx
    .select({ userId: eventMembers.userId })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.team, team)))
    .orderBy(desc(eventMembers.teamJoinedAt))
    .limit(1)
  return row?.userId ?? null
}

/**
 * Freezes the Team names at the first Session start (#164): one `event_teams` row per team position 1..`teamCount`
 * with the name composed from the team's words (null without words: the Team colour's name). Called once, by the start
 * that finds no Session started; the rows are the names from then on, whatever happens to the words.
 */
export async function freezeTeamNames(tx: Db, eventId: string, teamCount: number): Promise<void> {
  const members = await tx
    .select({ team: eventMembers.team, teamWord: eventMembers.teamWord, teamJoinedAt: eventMembers.teamJoinedAt })
    .from(eventMembers)
    .where(eq(eventMembers.eventId, eventId))
  const rows = Array.from({ length: teamCount }, (_, index) => ({ eventId, position: index + 1, frozenName: composeTeamName(members, index + 1) }))
  await tx.insert(eventTeams).values(rows)
}
