import { defineEventHandler, getRouterParam } from 'h3'
import { rescheduleRejection } from '../../../../../domain/phase'
import { useDb } from '../../../../../utils/db'
import { sessionNotFound } from '../../../../../utils/errors'
import { loadEvent } from '../../../../../utils/event-access'
import { readNewDate } from '../../../../../utils/new-date'
import { eventSessions, moveSessionDate } from '../../../../../utils/sessions'
import { requireUser } from '../../../../../utils/user'

// Reschedule of one Session (#53, ADR 0011): the Host moves that Session's set Date to another future Berlin
// time. The other Sessions keep their Dates and Slots; the moved Session keeps its Slot taken. Every Session
// whose number changes gets its calendar SEQUENCE raised (sequenceRaises), so a re-download updates it. The
// Event row is locked, so a Reschedule that races a Reopen or a confirm cannot write over it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const sessionId = getRouterParam(event, 'id') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })
    const before = await eventSessions(tx, eventRow.id)
    const session = before.find(row => row.id === sessionId)
    if (!session) throw sessionNotFound()

    const startsAt = await readNewDate(event, startsAt => rescheduleRejection({
      hasDate: session.startsAt !== null,
      startsAt,
      now: new Date(),
      duplicate: before.some(row => row.id !== session.id && row.startsAt?.getTime() === startsAt.getTime()),
    }))
    return { startsAt: await moveSessionDate(tx, eventRow, before, session.id, startsAt) }
  })
})
