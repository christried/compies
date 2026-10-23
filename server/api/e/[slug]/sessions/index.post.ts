import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { sessions } from '../../../../db/schema'
import { parseLocalTime } from '../../../../domain/event'
import { addSessionRejection } from '../../../../domain/phase'
import { sequenceRaises } from '../../../../domain/session'
import { useDb } from '../../../../utils/db'
import { apiError } from '../../../../utils/errors'
import { loadEvent } from '../../../../utils/event-access'
import { isSlotTaken, eventSessions, raiseSequences, setEventPhase, slotAt } from '../../../../utils/sessions'
import { requireUser } from '../../../../utils/user'

// Adds a Session to an Event (#55, ADR 0011). The Host gives a Date, or leaves it to the Date poll by sending
// no `startsAt`. A given Date is future and not another Session's; when an open Slot has that time, the Session
// takes the Slot. Adding an undated Session sends a date-set Event back to the poll. The Event row is locked
// for the whole write, so an add cannot race a confirm into a wrong Phase or the 8-Session limit.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<{ startsAt?: unknown } | null>(event)

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })
    const before = await eventSessions(tx, eventRow.id)

    const given = body?.startsAt !== undefined && body?.startsAt !== null
    const startsAt = given ? parseLocalTime(body?.startsAt) : null
    if (given && startsAt === null) throw apiError('invalid_time')

    const rejection = addSessionRejection({
      phase: eventRow.phase,
      count: before.length,
      startsAt,
      now: new Date(),
      duplicate: startsAt !== null && before.some(row => row.startsAt?.getTime() === startsAt.getTime()),
    })
    if (rejection) throw apiError(rejection)

    // A Slot that is already some Session's Date stays with that Session (a rescheduled one keeps its Slot).
    const slotId = startsAt ? await slotAt(tx, eventRow.id, startsAt) : null
    const takenSlot = slotId !== null && await isSlotTaken(tx, eventRow.id, slotId)
    const [row] = await tx
      .insert(sessions)
      .values({ eventId: eventRow.id, startsAt, slotId: takenSlot ? null : slotId })
      .returning({ id: sessions.id, startsAt: sessions.startsAt })

    const after = [...before, { id: row!.id, startsAt: row!.startsAt }]
    await raiseSequences(tx, sequenceRaises(before, after))
    return { id: row!.id, phase: await setEventPhase(tx, eventRow.id, after.map(session => session.startsAt)) }
  })
})
