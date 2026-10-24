import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { pollSlots } from '../../../../db/schema'
import { parseAddedSlot } from '../../../../domain/event'
import { useDb } from '../../../../utils/db'
import { apiError } from '../../../../utils/errors'
import { lockEventForSlotEdit } from '../../../../utils/host-event'
import { requireUser } from '../../../../utils/user'

// Add a Slot to a Date poll (#15, #1 § Domain rules). Host only, Phase `poll`. The Slot must be in the
// future, unique per minute and leave at most 16 Slots in the Event. The Event is locked for the
// whole write, so two adds cannot both pass the limit. Members see the Slot on their next read.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<{ startsAt?: unknown } | null>(event)

  return useDb(event).transaction(async (tx) => {
    const eventRow = await lockEventForSlotEdit(tx, slug, user.id)
    const existing = await tx
      .select({ startsAt: pollSlots.startsAt })
      .from(pollSlots)
      .where(eq(pollSlots.eventId, eventRow.id))

    const parsed = parseAddedSlot(body?.startsAt, existing.map(row => row.startsAt), new Date())
    if (!parsed.ok) throw apiError(parsed.error)

    const [slot] = await tx
      .insert(pollSlots)
      .values({ eventId: eventRow.id, startsAt: parsed.startsAt })
      .returning({ id: pollSlots.id, startsAt: pollSlots.startsAt })
    return { slotId: slot!.id, startsAt: slot!.startsAt }
  })
})
