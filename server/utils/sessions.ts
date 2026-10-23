import { and, eq } from 'drizzle-orm'
import { sessions } from '../db/schema'
import type { Db } from './db'

// The Sessions of an Event (ADR 0011, #48, #49, #52). `eventSession` still assumes one Session: Reschedule,
// Reopen and the .ics use it until #53 and #55 bring per-Session handling.

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
