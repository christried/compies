import { and, eq, sql } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { sessions } from '../../../db/schema'
import { rescheduleRejection, rescheduleValues } from '../../../domain/phase'
import { parseLocalTime } from '../../../domain/session'
import { useDb } from '../../../utils/db'
import { isMember, sessionNotFound } from '../../../utils/invite'
import { requireUser } from '../../../utils/user'

// Reschedule (#1 § Domain rules, #14): the Host moves a set Date to another future Berlin time. The
// Session stays in date_set. icsSequence goes up in the same UPDATE, so a re-downloaded .ics replaces
// the calendar event (same UID, higher SEQUENCE). The phase is part of the WHERE, so a Reschedule that
// races a Reopen cannot write over it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''

  const db = useDb(event)
  const [session] = await db.select().from(sessions).where(eq(sessions.slug, slug))
  if (!session || !(await isMember(db, session.id, user.id))) throw sessionNotFound()
  if (session.deletedAt) throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
  if (session.hostId !== user.id) throw createError({ statusCode: 403, statusMessage: 'not_host' })

  const body = await readBody<{ startsAt?: unknown } | null>(event)
  const startsAt = parseLocalTime(body?.startsAt)
  if (!startsAt) throw createError({ statusCode: 400, statusMessage: 'invalid_time' })

  const rejection = rescheduleRejection({ phase: session.phase, startsAt, now: new Date() })
  if (rejection === 'wrong_phase') throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
  if (rejection === 'in_past') throw createError({ statusCode: 400, statusMessage: 'in_past' })

  const [row] = await db
    .update(sessions)
    .set({ ...rescheduleValues(startsAt), icsSequence: sql`${sessions.icsSequence} + 1` })
    .where(and(eq(sessions.id, session.id), eq(sessions.phase, 'date_set')))
    .returning({ startsAt: sessions.startsAt })
  if (!row) throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })

  return { startsAt: row.startsAt }
})
