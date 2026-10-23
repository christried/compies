import { and, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { events } from '../../../db/schema'
import { setDateRejection, setDateValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { readNewDate } from '../../../utils/new-date'
import { loadEvent } from '../../../utils/event-access'
import { requireUser } from '../../../utils/user'

// Set the Date (#1 § Domain rules, ADR 0003): the Host moves the poll to `date_set` at a future Berlin
// time. The body carries `startsAt` as `YYYY-MM-DDTHH:mm` (the Berlin wall clock, as the create form
// sends it). From then on the Votes are frozen, because votes need the poll phase. The phase is part of
// the update's WHERE, so two confirms at once cannot both succeed.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true })

  const startsAt = await readNewDate(event, startsAt => setDateRejection({ phase: eventRow.phase, startsAt, now: new Date() }))

  const [row] = await db
    .update(events)
    .set(setDateValues(startsAt))
    .where(and(eq(events.id, eventRow.id), eq(events.phase, 'poll')))
    .returning({ startsAt: events.startsAt })
  if (!row) throw apiError('wrong_phase')

  return { startsAt: row.startsAt }
})
