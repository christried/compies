import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { sessions } from '../../../db/schema'
import { setDateRejection } from '../../../domain/phase'
import { hasDateAt } from '../../../domain/session'
import { apiError, slotNotFound } from '../../../utils/errors'
import { findSlot } from '../../../utils/slots'
import { changeSessions } from '../../../utils/sessions'

// Set a Date from the shared Date poll (#1 § Domain rules, ADR 0011, #52): the Host picks a Slot, and its
// time goes to the first Session that still has no Date. The Event stays in the poll while another
// Session waits and moves to `date_set` once every Session has one. The Slot is taken by that Session, so
// it is no longer open. The Sessions whose number moves up (a Date earlier than the others) get a higher
// calendar SEQUENCE (#53).
export default defineEventHandler(event => changeSessions(event, async ({ tx, eventRow, sessions: before, body }) => {
  const slotId = typeof body?.slotId === 'string' ? body.slotId : ''
  const slot = await findSlot(tx, eventRow.id, slotId)
  if (!slot) throw slotNotFound()

  const undated = before.filter(row => row.startsAt === null)
  const rejection = setDateRejection({
    phase: eventRow.phase,
    startsAt: slot.startsAt,
    now: new Date(),
    taken: before.some(row => row.slotId === slot.id),
    undated: undated.length,
    duplicate: hasDateAt(before, slot.startsAt),
  })
  if (rejection) throw apiError(rejection)

  await tx
    .update(sessions)
    .set({ startsAt: slot.startsAt, previousStartsAt: null, slotId: slot.id })
    .where(eq(sessions.id, undated[0]!.id))
  return { startsAt: slot.startsAt }
}))
