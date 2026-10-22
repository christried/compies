import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { sessions } from '../../../db/schema'
import { setDateRejection, setDateValues } from '../../../domain/phase'
import { parseLocalTime } from '../../../domain/session'
import { useDb } from '../../../utils/db'
import { isMember, sessionNotFound } from '../../../utils/invite'
import { requireUser } from '../../../utils/user'

// Set the Date (#1 § Domain rules, ADR 0003): the Host moves the poll to `date_set` at a future Berlin
// time. The body carries `startsAt` as `YYYY-MM-DDTHH:mm` (the Berlin wall clock, as the create form
// sends it). From then on the Votes are frozen, because votes need the poll phase. The phase is part of
// the update's WHERE, so two confirms at once cannot both succeed.
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

  const rejection = setDateRejection({ phase: session.phase, startsAt, now: new Date() })
  if (rejection === 'wrong_phase') throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
  if (rejection === 'in_past') throw createError({ statusCode: 400, statusMessage: 'in_past' })

  const [row] = await db
    .update(sessions)
    .set(setDateValues(startsAt))
    .where(and(eq(sessions.id, session.id), eq(sessions.phase, 'poll')))
    .returning({ startsAt: sessions.startsAt })
  if (!row) throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })

  return { startsAt: row.startsAt }
})
