import { and, desc, eq, sql } from 'drizzle-orm'
import { eventMembers } from '../db/schema'
import { teamChoiceOpen, type Place } from '../../shared/board'
import { settingsFromRow } from '../../shared/settings'
import type { Db } from './db'
import type { EventRow } from './event-access'
import type { SessionRow } from './sessions'

// The seats of the Game board (#160, GLOSSARY: Game board). One home: every write of a Member's zone, team and
// team_joined_at goes through seatMember, so a rule that follows a seat change (#161: leaving a team clears the Team
// word; #163: removed teams send their Players to the Bench) has one place to live.

type MemberRow = typeof eventMembers.$inferSelect

/** The place a Member row stands for. The table's check keeps `team` set exactly when the zone is `team`. */
export function placeOfRow(row: Pick<MemberRow, 'zone' | 'team'>): Place {
  return row.zone === 'team' && row.team !== null ? { zone: 'team', team: row.team } : { zone: row.zone === 'stands' ? 'stands' : 'bench' }
}

/** Every Member of the Event with the place they stand in. */
export async function readSeats(tx: Db, eventId: string): Promise<{ userId: string, place: Place }[]> {
  const rows = await tx
    .select({ userId: eventMembers.userId, zone: eventMembers.zone, team: eventMembers.team })
    .from(eventMembers)
    .where(eq(eventMembers.eventId, eventId))
  return rows.map(row => ({ userId: row.userId, place: placeOfRow(row) }))
}

/**
 * Puts the Member in `to`. Entering a team (or changing team) stamps `team_joined_at` with the moment of the write,
 * leaving a team clears it. The stamp is the clock, not the transaction start, so seats taken one after the other
 * keep their order even when their transactions began together (lastToJoin reads it).
 */
export async function seatMember(tx: Db, eventId: string, userId: string, to: Place): Promise<void> {
  const team = to.zone === 'team' ? to.team : null
  await tx
    .update(eventMembers)
    .set({ zone: to.zone, team, teamJoinedAt: team === null ? null : sql`clock_timestamp()` })
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
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
 * Whether Team choice is open for an Event and whether its first Session has started, from its settings and Sessions.
 * The move and the Event read both ask here. `started` stays false until Session start (#164) adds `started_at`.
 */
export function teamChoiceOf(eventRow: EventRow, sessions: readonly SessionRow[]) {
  const settings = settingsFromRow(eventRow)
  const started = false
  return { settings, started, open: teamChoiceOpen({ settings, hasDatedSession: sessions.some(row => row.startsAt !== null), started }) }
}
