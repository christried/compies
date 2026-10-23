import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { pollSlots, pollVotes } from '../../../../db/schema'
import { useDb } from '../../../../utils/db'
import { apiError, slotNotFound } from '../../../../utils/errors'
import { lockEventForSlotEdit } from '../../../../utils/host-event'
import { isSlotTaken } from '../../../../utils/sessions'
import { findSlot } from '../../../../utils/slots'
import { requireUser } from '../../../../utils/user'

// Remove a Slot from a Date poll (#15, #1 § Domain rules). Host only, Phase `poll`. The Slot's Votes
// are deleted in the same transaction as the Slot. The UI asks for a 1 s hold when there are Votes;
// the server does not need to know about the hold.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const slotId = getRouterParam(event, 'slotId') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await lockEventForSlotEdit(tx, slug, user.id)
    const slot = await findSlot(tx, eventRow.id, slotId)
    if (!slot) throw slotNotFound()
    // A Slot that became a Date is not open any more, and its Votes are frozen (#52).
    if (await isSlotTaken(tx, eventRow.id, slot.id)) throw apiError('slot_taken')

    const dropped = await tx
      .delete(pollVotes)
      .where(eq(pollVotes.slotId, slot.id))
      .returning({ slotId: pollVotes.slotId })
    await tx.delete(pollSlots).where(eq(pollSlots.id, slot.id))
    return { slotId: slot.id, votesDeleted: dropped.length }
  })
})
