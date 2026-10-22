import { and, eq, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../db/schema'
import { rescheduleRejection, rescheduleValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { readNewDate } from '../../../utils/new-date'
import { loadSession } from '../../../utils/session-access'
import { requireUser } from '../../../utils/user'

// Reschedule (#1 § Domain rules, #14): the Host moves a set Date to another future Berlin time. The
// Session stays in date_set. icsSequence goes up in the same UPDATE, so a re-downloaded .ics replaces
// the calendar event (same UID, higher SEQUENCE). The phase is part of the WHERE, so a Reschedule that
// races a Reopen cannot write over it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const session = await loadSession(db, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true })

  const startsAt = await readNewDate(event, startsAt => rescheduleRejection({ phase: session.phase, startsAt, now: new Date() }))

  const [row] = await db
    .update(sessions)
    .set({ ...rescheduleValues(startsAt), icsSequence: sql`${sessions.icsSequence} + 1` })
    .where(and(eq(sessions.id, session.id), eq(sessions.phase, 'date_set')))
    .returning({ startsAt: sessions.startsAt })
  if (!row) throw apiError('wrong_phase')

  return { startsAt: row.startsAt }
})
