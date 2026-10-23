import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { events, pollSlots, sessions } from '../db/schema'
import { sequenceRaises, type SessionDate } from '../domain/session'
import { phaseAfterChange, rescheduleValues } from '../domain/phase'
import type { Phase } from '../../shared/event'
import { apiError } from './errors'
import type { Db } from './db'

// The Sessions of an Event (ADR 0011, #48, #52, #53, #55). Every handler that adds, removes, moves, sets or
// reopens a Session reads the Sessions under the Event lock, writes the change, then calls finishSessionChange
// in the same transaction: it raises the calendar sequences and writes the Phase.

export type SessionRow = typeof sessions.$inferSelect

/** The Sessions of an Event. */
export function eventSessions(db: Db, eventId: string): Promise<SessionRow[]> {
  return db.select().from(sessions).where(eq(sessions.eventId, eventId))
}

/** Raises the calendar SEQUENCE of these Sessions by one, so a re-import replaces their entries (#53, #55). */
export async function raiseSequences(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.update(sessions).set({ icsSequence: sql`${sessions.icsSequence} + 1` }).where(inArray(sessions.id, ids))
}

/**
 * The tail of every change to an Event's Sessions (#49, #52, #53, #55): `before` and `after` are the Sessions
 * as read under the Event lock and as they are once the change is written. Raises the SEQUENCE of every
 * Session whose entry changed (sequenceRaises), then writes the Phase the Dates leave (phaseAfterChange).
 * Returns the Phase written.
 */
export async function finishSessionChange(db: Db, event: { id: string, phase: Phase }, before: SessionDate[], after: SessionDate[]): Promise<Phase> {
  await raiseSequences(db, sequenceRaises(before, after))
  const phase = phaseAfterChange(event.phase, after.map(session => session.startsAt))
  await db.update(events).set({ phase }).where(eq(events.id, event.id))
  return phase
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
 * Event lock; the caller has checked the Session has a Date and the new time is future and distinct. The
 * Session keeps its Slot. The Sessions whose entry changes get their icsSequence raised (finishSessionChange).
 */
export async function moveSessionDate(db: Db, event: { id: string, phase: Phase }, before: SessionRow[], sessionId: string, startsAt: Date): Promise<Date> {
  const [row] = await db
    .update(sessions)
    .set(rescheduleValues(startsAt))
    .where(and(eq(sessions.id, sessionId), isNotNull(sessions.startsAt)))
    .returning({ startsAt: sessions.startsAt })
  if (!row) throw apiError('wrong_phase')

  const after = before.map(session => (session.id === sessionId ? { ...session, startsAt } : session))
  await finishSessionChange(db, event, before, after)
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
