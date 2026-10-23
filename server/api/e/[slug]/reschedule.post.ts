import { and, eq, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { events } from '../../../db/schema'
import { rescheduleRejection, rescheduleValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { readNewDate } from '../../../utils/new-date'
import { loadEvent } from '../../../utils/event-access'
import { requireUser } from '../../../utils/user'

// Reschedule (#1 § Domain rules, #14): the Host moves a set Date to another future Berlin time. The
// Event stays in date_set. icsSequence goes up in the same UPDATE, so a re-downloaded .ics replaces
// the calendar event (same UID, higher SEQUENCE). The phase is part of the WHERE, so a Reschedule that
// races a Reopen cannot write over it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true })

  const startsAt = await readNewDate(event, startsAt => rescheduleRejection({ phase: eventRow.phase, startsAt, now: new Date() }))

  const [row] = await db
    .update(events)
    .set({ ...rescheduleValues(startsAt), icsSequence: sql`${events.icsSequence} + 1` })
    .where(and(eq(events.id, eventRow.id), eq(events.phase, 'date_set')))
    .returning({ startsAt: events.startsAt })
  if (!row) throw apiError('wrong_phase')

  return { startsAt: row.startsAt }
})
