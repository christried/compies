import { and, eq, sql } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../db/schema'
import { reopenRejection, reopenValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { isMember, sessionNotFound } from '../../../utils/invite'
import { requireUser } from '../../../utils/user'

// Reopen (#1 § Domain rules, #14): the Host withdraws the set Date and the Session goes back to the
// Date poll. The old Date is kept as previousStartsAt, so every Member sees the notice to delete it
// from their calendar. Slots and Votes stay; Votes are editable again because the phase is poll (#1).
// icsSequence goes up in the same UPDATE, and the old Date is read in that statement, so a race with a
// Reschedule cannot store a stale Date. The phase is part of the WHERE, so a second Reopen fails.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''

  const db = useDb(event)
  const [session] = await db.select().from(sessions).where(eq(sessions.slug, slug))
  if (!session || !(await isMember(db, session.id, user.id))) throw sessionNotFound()
  if (session.deletedAt) throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
  if (session.hostId !== user.id) throw createError({ statusCode: 403, statusMessage: 'not_host' })

  if (reopenRejection({ phase: session.phase })) throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })

  const [row] = await db
    .update(sessions)
    .set({
      ...reopenValues(),
      previousStartsAt: sql`${sessions.startsAt}`,
      icsSequence: sql`${sessions.icsSequence} + 1`,
    })
    .where(and(eq(sessions.id, session.id), eq(sessions.phase, 'date_set')))
    .returning({ phase: sessions.phase })
  if (!row) throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })

  return { phase: row.phase }
})
