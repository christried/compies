import { and, eq, isNull } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { sessions } from '../../../db/schema'
import { setDateRejection, setDateValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError, slotNotFound } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { findSlot } from '../../../utils/slots'
import { eventSessions, finishSessionChange, isSlotTaken } from '../../../utils/sessions'
import { requireUser } from '../../../utils/user'

// Set a Date from the shared Date poll (#1 § Domain rules, ADR 0011, #52): the Host picks a Slot, and its
// time goes to the first Session that still has no Date. The Event stays in the poll while another
// Session waits and moves to `date_set` once every Session has one. The Slot is taken by that Session, so
// it is no longer open. The Event row is locked for the whole transaction, so two confirms at once queue
// up: one Slot never goes to two Sessions, and one Session is never filled twice. The Sessions whose
// number moves up (a Date earlier than the others) get a higher calendar SEQUENCE (#53).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<{ slotId?: unknown } | null>(event)
  const slotId = typeof body?.slotId === 'string' ? body.slotId : ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })

    const slot = await findSlot(tx, eventRow.id, slotId)
    if (!slot) throw slotNotFound()

    const before = await eventSessions(tx, eventRow.id)
    const undated = before.filter(row => row.startsAt === null)
    const taken = await isSlotTaken(tx, eventRow.id, slot.id)
    const duplicate = before.some(row => row.startsAt?.getTime() === slot.startsAt.getTime())
    const rejection = setDateRejection({ phase: eventRow.phase, startsAt: slot.startsAt, now: new Date(), taken, undated: undated.length, duplicate })
    if (rejection) throw apiError(rejection)

    const [row] = await tx
      .update(sessions)
      .set(setDateValues(slot.startsAt, slot.id))
      .where(and(eq(sessions.id, undated[0]!.id), isNull(sessions.startsAt)))
      .returning({ startsAt: sessions.startsAt })
    if (!row) throw apiError('wrong_phase')

    const after = before.map(session => (session.id === undated[0]!.id ? { ...session, startsAt: row.startsAt } : session))
    await finishSessionChange(tx, eventRow, before, after)
    return { startsAt: row.startsAt }
  })
})
