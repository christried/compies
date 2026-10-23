import { and, eq, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { events } from '../../../db/schema'
import { reopenRejection, reopenValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { requireUser } from '../../../utils/user'

// Reopen (#1 § Domain rules, #14): the Host withdraws the set Date and the Event goes back to the
// Date poll. The old Date is kept as previousStartsAt, so every Member sees the notice to delete it
// from their calendar. Slots and Votes stay; Votes are editable again because the phase is poll (#1).
// icsSequence goes up in the same UPDATE, and the old Date is read in that statement, so a race with a
// Reschedule cannot store a stale Date. The phase is part of the WHERE, so a second Reopen fails.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true })

  const rejection = reopenRejection({ phase: eventRow.phase })
  if (rejection) throw apiError(rejection)

  const [row] = await db
    .update(events)
    .set({
      ...reopenValues(),
      previousStartsAt: sql`${events.startsAt}`,
      icsSequence: sql`${events.icsSequence} + 1`,
    })
    .where(and(eq(events.id, eventRow.id), eq(events.phase, 'date_set')))
    .returning({ phase: events.phase })
  if (!row) throw apiError('wrong_phase')

  return { phase: row.phase }
})
