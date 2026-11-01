import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../../../db/schema'
import { parseLocalTime } from '../../../../../domain/event'
import { rescheduleRejection } from '../../../../../domain/phase'
import { hasDateAt } from '../../../../../domain/session'
import { recordActivity } from '../../../../../utils/activity'
import { apiError } from '../../../../../utils/errors'
import { changeSessions, findSession, shownNumber } from '../../../../../utils/sessions'
import { useClock } from '../../../../../utils/clock'
import { isoInstant } from '../../../../../../shared/activity'
import type { SessionRescheduled } from '../../../../../../shared/event'
import { isStarted } from '../../../../../../shared/session-state'

// Reschedule of one Session (#53, ADR 0011): the Host moves that Session's set Date to another future Berlin
// time. The other Sessions keep their Dates and Slots; the moved Session keeps its Slot taken. Every Session
// whose number changes gets its calendar SEQUENCE raised (sequenceRaises), so a re-download updates it. The
// Event row is locked, so a Reschedule that races a Reopen or a confirm cannot write over it.
export default defineEventHandler((event): Promise<SessionRescheduled> => changeSessions(event, async ({ tx, eventRow, user, publish, sessions: before, body }) => {
  const session = findSession(before, getRouterParam(event, 'id'))
  const startsAt = parseLocalTime(body.startsAt)
  if (!startsAt) throw apiError('invalid_time')

  const rejection = rescheduleRejection({ hasDate: session.startsAt !== null, started: isStarted(session), startsAt, now: useClock(event).now(), duplicate: hasDateAt(before, startsAt, session.id) })
  if (rejection) throw apiError(rejection)

  await tx.update(sessions).set({ startsAt, previousStartsAt: null }).where(eq(sessions.id, session.id))
  // The number is the one the Session has at its new Date (#159); rescheduleRejection saw that it had a Date.
  const number = await shownNumber(tx, eventRow.id, session.id)
  await recordActivity(tx, publish, eventRow.id, { type: 'date_rescheduled', actorId: user.id, params: { sessionId: session.id, number, from: isoInstant(session.startsAt!), to: isoInstant(startsAt) } })
  return { startsAt: startsAt.toISOString() }
}))
