import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { events, pollSlots, sessions } from '../db/schema'
import { phaseAfterChange } from '../domain/phase'
import { sequenceRaises } from '../domain/session'
import type { Phase } from '../../shared/event'
import { asRecord } from '../../shared/record'
import { sessionNotFound } from './errors'
import { changeEvent, type EventRow } from './event-access'
import type { Db } from './db'

// The Sessions of an Event (ADR 0011, #48, #52, #53, #55, #69). Every Session endpoint runs through changeSessions:
// it reads the body before the Event lock, reads the Sessions under the lock, lets the rule write, then reads
// the Sessions again and raises the calendar sequences and writes the Phase from that stored state.

export type SessionRow = typeof sessions.$inferSelect

/**
 * One Host change to an Event's Sessions (#69), through changeEvent. `before` and `after` are read from the database
 * under the Event lock, so the calendar sequence and the Phase never come from a hand-built copy of what was written.
 * The Session read is `eventSessions` (below), which leaves removed Sessions out (#65). Each handler reads the field of
 * `body` it needs; `body` is a record, empty when the request sent none.
 */
export function changeSessions<T extends object>(
  event: H3Event,
  change: (ctx: { tx: Db, eventRow: EventRow, sessions: SessionRow[], body: Record<string, unknown> }) => Promise<T>,
): Promise<T & { phase: Phase }> {
  return changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow, body }) => {
    const before = await eventSessions(tx, eventRow.id)
    const result = await change({ tx, eventRow, sessions: before, body: asRecord(body) })
    const after = await eventSessions(tx, eventRow.id)
    await raiseSequences(tx, sequenceRaises(before, after))
    const phase = phaseAfterChange(eventRow.phase, after.map(row => row.startsAt))
    await tx.update(events).set({ phase }).where(eq(events.id, eventRow.id))
    return { ...result, phase }
  })
}

/**
 * A Session the Host has not removed (#65). A removed Session only lives on in its notice, so it counts
 * nowhere else: every read of an Event's Sessions (here and Home) filters with this.
 */
export const sessionNotRemoved = isNull(sessions.removedAt)

/** The Sessions of an Event. A removed Session is not one of them (#65). */
export function eventSessions(db: Db, eventId: string): Promise<SessionRow[]> {
  return db.select().from(sessions).where(and(eq(sessions.eventId, eventId), sessionNotRemoved))
}

/**
 * The removed Sessions of an Event that had a Date, with that Date (#65): only for the notice that tells
 * every Member to delete the evening from their calendar. Earliest Date first.
 */
export async function removedSessionNotices(db: Db, eventId: string): Promise<{ id: string, previousStartsAt: Date }[]> {
  const rows = await db
    .select({ id: sessions.id, previousStartsAt: sessions.previousStartsAt })
    .from(sessions)
    .where(and(eq(sessions.eventId, eventId), isNotNull(sessions.removedAt), isNotNull(sessions.previousStartsAt)))
    .orderBy(asc(sessions.previousStartsAt))
  return rows.filter((row): row is { id: string, previousStartsAt: Date } => row.previousStartsAt !== null)
}

/** The Session with this id, or 404 (#69). */
export function findSession<S extends { id: string }>(rows: S[], id: string | undefined): S {
  const session = rows.find(row => row.id === id)
  if (!session) throw sessionNotFound()
  return session
}

/** Raises the calendar SEQUENCE of these Sessions by one, so a re-import replaces their entries (#53, #55). */
async function raiseSequences(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.update(sessions).set({ icsSequence: sql`${sessions.icsSequence} + 1` }).where(inArray(sessions.id, ids))
}

/** Whether a Session of this Event has the Slot as its Date's Slot, so the Slot is no longer open (#52). */
export async function isSlotTaken(db: Db, eventId: string, slotId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.eventId, eventId), eq(sessions.slotId, slotId)))
  return row !== undefined
}

/** The Slot of this Event that starts at this instant, or null. A Date typed in by the Host may match one. */
export async function slotAt(db: Db, eventId: string, startsAt: Date): Promise<string | null> {
  const [slot] = await db
    .select({ id: pollSlots.id })
    .from(pollSlots)
    .where(and(eq(pollSlots.eventId, eventId), eq(pollSlots.startsAt, startsAt)))
  return slot?.id ?? null
}
