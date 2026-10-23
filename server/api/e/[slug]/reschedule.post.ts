import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../db/schema'
import { rescheduleRejection, rescheduleValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { readNewDate } from '../../../utils/new-date'
import { loadEvent } from '../../../utils/event-access'
import { eventSession } from '../../../utils/sessions'
import { requireUser } from '../../../utils/user'

// Reschedule (#1 § Domain rules, #14, ADR 0011): the Host moves the Session's set Date to another future
// Berlin time. The Event stays in date_set and the Slot the Session came from stays taken. The Session's
// icsSequence goes up in the same UPDATE, so a re-downloaded .ics replaces the calendar event (same UID,
// higher SEQUENCE). The Event row is locked, so a Reschedule that races a Reopen cannot write over it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })

    const startsAt = await readNewDate(event, startsAt => rescheduleRejection({ phase: eventRow.phase, startsAt, now: new Date() }))

    const session = await eventSession(tx, eventRow.id)
    const [row] = await tx
      .update(sessions)
      .set({ ...rescheduleValues(startsAt), icsSequence: sql`${sessions.icsSequence} + 1` })
      .where(and(eq(sessions.id, session.id), isNotNull(sessions.startsAt)))
      .returning({ startsAt: sessions.startsAt })
    if (!row) throw apiError('wrong_phase')

    return { startsAt: row.startsAt }
  })
})
