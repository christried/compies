import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { events, sessions } from '../../../db/schema'
import { reopenRejection, reopenValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { eventSession } from '../../../utils/sessions'
import { requireUser } from '../../../utils/user'

// Reopen (#1 § Domain rules, #14, ADR 0011): the Host withdraws the Session's set Date and the Event goes
// back to the Date poll. The old Date is kept as the Session's previousStartsAt, so every Member sees the
// notice to delete it from their calendar. Slots and Votes stay; the Session's Slot is freed, so the
// Slot is open again. The old Date is read in the same UPDATE that clears it, and icsSequence goes up
// there too. The Event row is locked, so a second Reopen fails with wrong_phase.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })

    const rejection = reopenRejection({ phase: eventRow.phase })
    if (rejection) throw apiError(rejection)

    const session = await eventSession(tx, eventRow.id)
    const values = reopenValues()
    const [row] = await tx
      .update(sessions)
      .set({
        ...values.session,
        previousStartsAt: sql`${sessions.startsAt}`,
        icsSequence: sql`${sessions.icsSequence} + 1`,
      })
      .where(and(eq(sessions.id, session.id), isNotNull(sessions.startsAt)))
      .returning({ id: sessions.id })
    if (!row) throw apiError('wrong_phase')

    await tx.update(events).set({ phase: values.phase }).where(eq(events.id, eventRow.id))
    return { phase: values.phase }
  })
})
