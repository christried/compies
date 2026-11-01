import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { sessions } from '../../../db/schema'
import { setDateRejection } from '../../../domain/phase'
import { hasDateAt } from '../../../domain/session'
import { recordActivity } from '../../../utils/activity'
import { useClock } from '../../../utils/clock'
import { apiError, slotNotFound } from '../../../utils/errors'
import { findSlot } from '../../../utils/slots'
import { changeSessions, shownNumber } from '../../../utils/sessions'
import type { DateConfirmed } from '../../../../shared/event'

// Set a Date from the shared Date poll (#1 § Domain rules, ADR 0011, #52): the Host picks a Slot, and its
// time goes to the first Session that still has no Date. The Event stays in the poll while another
// Session waits and moves to `date_set` once every Session has one. The Slot is taken by that Session, so
// it is no longer open. The Sessions whose number moves up (a Date earlier than the others) get a higher
// calendar SEQUENCE (#53).
export default defineEventHandler((event): Promise<DateConfirmed> => changeSessions(event, async ({ tx, eventRow, user, publish, sessions: before, body }) => {
  const slotId = typeof body.slotId === 'string' ? body.slotId : ''
  const slot = await findSlot(tx, eventRow.id, slotId)
  if (!slot) throw slotNotFound()

  const undated = before.filter(row => row.startsAt === null)
  const rejection = setDateRejection({
    phase: eventRow.phase,
    startsAt: slot.startsAt,
    now: useClock(event).now(),
    taken: before.some(row => row.slotId === slot.id),
    undated: undated.length,
    duplicate: hasDateAt(before, slot.startsAt),
  })
  if (rejection) throw apiError(rejection)

  const sessionId = undated[0]!.id
  await tx
    .update(sessions)
    .set({ startsAt: slot.startsAt, previousStartsAt: null, slotId: slot.id })
    .where(eq(sessions.id, sessionId))
  // The number is the one the Session has with its new Date (#159).
  const number = await shownNumber(tx, eventRow.id, sessionId)
  await recordActivity(tx, publish, eventRow.id, { type: 'date_set', actorId: user.id, params: { sessionId, number, startsAt: slot.startsAt.toISOString() } })
  return { startsAt: slot.startsAt.toISOString() }
}))
