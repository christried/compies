import { defineEventHandler } from 'h3'
import { sessions } from '../../../../db/schema'
import { parseLocalTime } from '../../../../domain/event'
import { addSessionRejection } from '../../../../domain/phase'
import { hasDateAt } from '../../../../domain/session'
import { apiError } from '../../../../utils/errors'
import { changeSessions, slotAt } from '../../../../utils/sessions'
import type { SessionAdded } from '../../../../../shared/event'

// Adds a Session to an Event (#55, ADR 0011). The Host gives a Date, or leaves it to the Date poll by sending
// no `startsAt`. A given Date is future and not another Session's; when an open Slot has that time, the Session
// takes the Slot. Adding an undated Session sends a date-set Event back to the poll. The Event row is locked
// for the whole write, so an add cannot race a confirm into a wrong Phase or the 8-Session limit.
export default defineEventHandler((event): Promise<SessionAdded> => changeSessions(event, async ({ tx, eventRow, sessions: before, body }) => {
  const given = body?.startsAt !== undefined && body?.startsAt !== null
  const startsAt = given ? parseLocalTime(body?.startsAt) : null
  if (given && startsAt === null) throw apiError('invalid_time')

  const rejection = addSessionRejection({
    phase: eventRow.phase,
    count: before.length,
    startsAt,
    now: new Date(),
    duplicate: startsAt !== null && hasDateAt(before, startsAt),
  })
  if (rejection) throw apiError(rejection)

  // A Slot that is already some Session's Date stays with that Session (a rescheduled one keeps its Slot).
  const slotId = startsAt ? await slotAt(tx, eventRow.id, startsAt) : null
  const takenSlot = slotId !== null && before.some(row => row.slotId === slotId)
  const [row] = await tx
    .insert(sessions)
    .values({ eventId: eventRow.id, startsAt, slotId: takenSlot ? null : slotId })
    .returning({ id: sessions.id })
  return { id: row!.id }
}))
