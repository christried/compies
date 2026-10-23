import { and, eq } from 'drizzle-orm'
import { pollSlots, sessions } from '../db/schema'
import type { Db } from './db'

// The Sessions of an Event (ADR 0011, #48). Each Event has exactly one Session for now; #49 brings
// several, and these helpers are the one place that will change.

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

/** The Slot of this Event that starts at this instant, or null. A Date typed in by the Host may match one. */
export async function slotAt(db: Db, eventId: string, startsAt: Date): Promise<string | null> {
  const [slot] = await db
    .select({ id: pollSlots.id })
    .from(pollSlots)
    .where(and(eq(pollSlots.eventId, eventId), eq(pollSlots.startsAt, startsAt)))
  return slot?.id ?? null
}
