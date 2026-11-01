import { eq, sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { countdowns, sessions } from '../../../../db/schema'
import { recordActivity } from '../../../../utils/activity'
import { apiError } from '../../../../utils/errors'
import { changeEvent } from '../../../../utils/event-access'
import { eventSessions, shownNumber } from '../../../../utils/sessions'
import { runningOf } from '../../../../../shared/session-state'
import type { SessionEnded } from '../../../../../shared/event'

// The Host ends the Running Session (#164, spec #153 § API contracts): the one that is started and not ended. The Event
// stays running; the next Session starts with its own start. Without a Running Session there is nothing to end.
export default defineEventHandler((event): Promise<SessionEnded> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow, user, publish }) => {
  const running = runningOf(await eventSessions(tx, eventRow.id))
  if (!running) throw apiError('no_running_session')

  await tx.update(sessions).set({ endedAt: sql`now()` }).where(eq(sessions.id, running.id))
  // The Countdown belongs to the Running Session: ending it clears it, in the same transaction (#236).
  await tx.delete(countdowns).where(eq(countdowns.eventId, eventRow.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'session_ended', actorId: user.id, params: { sessionId: running.id, number: await shownNumber(tx, eventRow.id, running.id) } })
  publish({ type: 'session.ended', sessionId: running.id })
  return { sessionId: running.id, phase: eventRow.phase }
}))
