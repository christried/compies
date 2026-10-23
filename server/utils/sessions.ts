import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { pollSlots, sessions } from '../db/schema'
import { sequenceRaises } from '../domain/session'
import { rescheduleValues } from '../domain/phase'
import { apiError } from './errors'
import type { Db } from './db'

// The Sessions of an Event (ADR 0011, #48, #52, #53). eventSession is the single-Session shortcut of the
// Reschedule route that still has no Session id; the per-Session handlers use eventSessions.

export type SessionRow = typeof sessions.$inferSelect

/** The Sessions of an Event. */
export function eventSessions(db: Db, eventId: string): Promise<SessionRow[]> {
  return db.select().from(sessions).where(eq(sessions.eventId, eventId))
}

/** The Event's one Session. Every Event has one: the migration and the create handler give it one. */
export async function eventSession(db: Db, eventId: string): Promise<SessionRow> {
  const [session] = await eventSessions(db, eventId)
  if (!session) throw new Error(`Event ${eventId} has no Session`)
  return session
}

/** Whether a Session of this Event has the Slot as its Date's Slot, so the Slot is no longer open (#52). */
export async function isSlotTaken(db: Db, eventId: string, slotId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.eventId, eventId), eq(sessions.slotId, slotId)))
  return row !== undefined
}

/**
 * Moves one Session's set Date (Reschedule, #53). `before` is the Event's Sessions as read under the
 * Event lock; the caller has checked the Session has a Date and the new time is future. The Session keeps
 * its Slot. Every Session whose number changes (sequenceRaises), the moved one included, gets its
 * icsSequence raised in the same transaction, so a re-import updates its entry.
 */
export async function moveSessionDate(db: Db, before: SessionRow[], sessionId: string, startsAt: Date): Promise<Date> {
  const [row] = await db
    .update(sessions)
    .set(rescheduleValues(startsAt))
    .where(and(eq(sessions.id, sessionId), isNotNull(sessions.startsAt)))
    .returning({ startsAt: sessions.startsAt })
  if (!row) throw apiError('wrong_phase')

  const after = before.map(session => (session.id === sessionId ? { ...session, startsAt } : session))
  const raised = sequenceRaises(before, after)
  if (raised.length > 0) {
    await db.update(sessions).set({ icsSequence: sql`${sessions.icsSequence} + 1` }).where(inArray(sessions.id, raised))
  }
  return startsAt
}

/** The Slot of this Event that starts at this instant, or null. A Date typed in by the Host may match one. */
export async function slotAt(db: Db, eventId: string, startsAt: Date): Promise<string | null> {
  const [slot] = await db
    .select({ id: pollSlots.id })
    .from(pollSlots)
    .where(and(eq(pollSlots.eventId, eventId), eq(pollSlots.startsAt, startsAt)))
  return slot?.id ?? null
}
