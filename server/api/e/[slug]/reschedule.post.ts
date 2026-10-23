import { defineEventHandler, getRouterParam } from 'h3'
import { rescheduleRejection } from '../../../domain/phase'
import { useDb } from '../../../utils/db'
import { readNewDate } from '../../../utils/new-date'
import { loadEvent } from '../../../utils/event-access'
import { eventSessions, moveSessionDate } from '../../../utils/sessions'
import { requireUser } from '../../../utils/user'

// Reschedule of the Event's one Session (#1 § Domain rules, #14, ADR 0011), kept for the Event page until
// #55 moves its cards onto POST /api/e/:slug/sessions/:id/reschedule. The Host moves the Session's set
// Date to another future Berlin time and keeps its Slot. The Event row is locked, so a Reschedule that races
// a Reopen cannot write over it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })
    const before = await eventSessions(tx, eventRow.id)
    const session = before[0]!

    const startsAt = await readNewDate(event, startsAt => rescheduleRejection({ hasDate: session.startsAt !== null, startsAt, now: new Date() }))
    return { startsAt: await moveSessionDate(tx, before, session.id, startsAt) }
  })
})
