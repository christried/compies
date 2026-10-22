import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { pollSlots, pollVotes } from '../../../../db/schema'
import { useDb } from '../../../../utils/db'
import { lockSessionForSlotEdit } from '../../../../utils/host-session'
import { requireUser } from '../../../../utils/user'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Remove a Slot from a Date poll (#15, #1 § Domain rules). Host only, Phase `poll`. The Slot's Votes
// are deleted in the same transaction as the Slot. The UI asks for a 1 s hold when there are Votes;
// the server does not need to know about the hold.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const slotId = getRouterParam(event, 'slotId') ?? ''

  return useDb(event).transaction(async (tx) => {
    const session = await lockSessionForSlotEdit(tx, slug, user.id)
    const [slot] = UUID.test(slotId)
      ? await tx
          .select({ id: pollSlots.id })
          .from(pollSlots)
          .where(and(eq(pollSlots.id, slotId), eq(pollSlots.sessionId, session.id)))
      : []
    if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

    const dropped = await tx
      .delete(pollVotes)
      .where(eq(pollVotes.slotId, slot.id))
      .returning({ slotId: pollVotes.slotId })
    await tx.delete(pollSlots).where(eq(pollSlots.id, slot.id))
    return { slotId: slot.id, votesDeleted: dropped.length }
  })
})
