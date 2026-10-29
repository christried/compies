import { and, eq } from 'drizzle-orm'
import { pollSlots } from '../db/schema'
import { isUuid } from '../domain/uuid'
import type { Db } from './db'

/** Every Slot of this Event, open or taken, as the Slot rule (parseEditedSlot) checks the Host's edits against. */
export function eventSlots(db: Db, eventId: string): Promise<{ id: string, startsAt: Date }[]> {
  return db.select({ id: pollSlots.id, startsAt: pollSlots.startsAt }).from(pollSlots).where(eq(pollSlots.eventId, eventId))
}

/** The Slot with this id in this Event, or null. Text that is not a uuid never reaches the database. */
export async function findSlot(db: Db, eventId: string, slotId: string) {
  if (!isUuid(slotId)) return null
  const [slot] = await db
    .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(and(eq(pollSlots.id, slotId), eq(pollSlots.eventId, eventId)))
  return slot ?? null
}
