import { and, eq } from 'drizzle-orm'
import { pollSlots } from '../db/schema'
import type { Db } from './db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The Slot with this id in this Event, or null. Text that is not a uuid never reaches the database. */
export async function findSlot(db: Db, eventId: string, slotId: string) {
  if (!UUID.test(slotId)) return null
  const [slot] = await db
    .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(and(eq(pollSlots.id, slotId), eq(pollSlots.eventId, eventId)))
  return slot ?? null
}
