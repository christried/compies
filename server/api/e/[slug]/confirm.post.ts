import { and, eq, isNull } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { events, sessions } from '../../../db/schema'
import { setDateRejection, setDateValues } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { readNewDate } from '../../../utils/new-date'
import { loadEvent } from '../../../utils/event-access'
import { eventSession, slotAt } from '../../../utils/sessions'
import { requireUser } from '../../../utils/user'

// Set the Date (#1 § Domain rules, ADR 0003, ADR 0011): the Host gives the Event's Session a future
// Berlin time (`YYYY-MM-DDTHH:mm`, as the create form sends it) and the Event moves to `date_set`. The
// Session remembers the Slot that has that time, if there is one. The Event row is locked for the whole
// transaction, so two confirms at once cannot both pass; the Session update also needs it still undated.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })

    const startsAt = await readNewDate(event, startsAt => setDateRejection({ phase: eventRow.phase, startsAt, now: new Date() }))

    const session = await eventSession(tx, eventRow.id)
    const values = setDateValues(startsAt, await slotAt(tx, eventRow.id, startsAt))
    const [row] = await tx
      .update(sessions)
      .set(values.session)
      .where(and(eq(sessions.id, session.id), isNull(sessions.startsAt)))
      .returning({ startsAt: sessions.startsAt })
    if (!row) throw apiError('wrong_phase')

    await tx.update(events).set({ phase: values.phase }).where(eq(events.id, eventRow.id))
    return { startsAt: row.startsAt }
  })
})
