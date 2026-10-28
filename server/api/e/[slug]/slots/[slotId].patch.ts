import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { pollSlots } from '../../../../db/schema'
import { parseEditedSlot } from '../../../../domain/event'
import { useDb } from '../../../../utils/db'
import { apiError, slotNotFound } from '../../../../utils/errors'
import { lockEventForSlotEdit } from '../../../../utils/host-event'
import { isSlotTaken } from '../../../../utils/sessions'
import { eventSlots, findSlot } from '../../../../utils/slots'
import { requireUser } from '../../../../utils/user'
import type { ChangedSlot } from '../../../../../shared/event'

// Change an open Slot's date and time (#85), e.g. to fix 19:00 to 20:00. Host only, Phase `poll`, under the same
// Event lock as adding and removing. The new time follows the rules for adding (parseEditedSlot), without the Slot
// itself. Its Votes stay; Members are not told (the Slot editor reminds the Host). A Slot that became a Date only
// moves through Reschedule.
export default defineEventHandler(async (event): Promise<ChangedSlot> => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const slotId = getRouterParam(event, 'slotId') ?? ''
  const body = await readBody<{ startsAt?: unknown } | null>(event)

  return useDb(event).transaction(async (tx) => {
    const eventRow = await lockEventForSlotEdit(tx, slug, user.id)
    const slot = await findSlot(tx, eventRow.id, slotId)
    if (!slot) throw slotNotFound()
    if (await isSlotTaken(tx, eventRow.id, slot.id)) throw apiError('slot_taken')

    const parsed = parseEditedSlot(body?.startsAt, await eventSlots(tx, eventRow.id), new Date(), slot.id)
    if (!parsed.ok) throw apiError(parsed.error)

    await tx.update(pollSlots).set({ startsAt: parsed.startsAt }).where(eq(pollSlots.id, slot.id))
    return { slotId: slot.id, startsAt: parsed.startsAt.toISOString() }
  })
})
