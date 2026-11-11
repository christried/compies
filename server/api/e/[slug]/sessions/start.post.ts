import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { events, sessions } from '../../../../db/schema'
import { recordActivity } from '../../../../utils/activity'
import { apiError } from '../../../../utils/errors'
import { changeEvent } from '../../../../utils/event-access'
import { readEventState, startOf } from '../../../../utils/event-state'
import { shownNumber } from '../../../../utils/sessions'
import { hasStarted } from '../../../../../shared/session-state'
import type { SessionStarted } from '../../../../../shared/event'

// The Host starts the next Session (#164, spec #153 § API contracts): the earliest dated Session that has not started,
// if the start rule (startOf of the Event state, #416) lets it. The first start also sets the Event to running (the Team names
// stay composed from the words, #438); later starts leave it alone. Not through changeSessions: that writes the Phase from the
// Dates, and a running Event keeps its Phase. The Event row is locked, so two starts cannot both pass the rule.
export default defineEventHandler((event): Promise<SessionStarted> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, now, eventRow, user, publish }) => {
  const state = await readEventState(tx, eventRow, now, ['sessions', 'members'])
  const { next, rejection } = startOf(state)
  if (rejection || next === null) throw apiError(rejection ?? 'no_dated_session')

  const first = !hasStarted(state.sessions)
  await tx.update(sessions).set({ startedAt: now }).where(eq(sessions.id, next.id))
  if (first) {
    await tx.update(events).set({ phase: 'running' }).where(eq(events.id, eventRow.id))
  }
  await recordActivity(tx, publish, eventRow.id, { type: 'session_started', actorId: user.id, params: { sessionId: next.id, number: await shownNumber(tx, eventRow.id, next.id) }, now })
  return { sessionId: next.id, phase: 'running' }
}))
