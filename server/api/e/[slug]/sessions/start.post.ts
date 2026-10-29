import { eq, sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { events, sessions } from '../../../../db/schema'
import { recordActivity } from '../../../../utils/activity'
import { freezeTeamNames, readSeats, startOf } from '../../../../utils/board'
import { apiError } from '../../../../utils/errors'
import { changeEvent } from '../../../../utils/event-access'
import { eventSessions, shownNumber } from '../../../../utils/sessions'
import type { SessionStarted } from '../../../../../shared/event'
import { settingsFromRow } from '../../../../../shared/settings'

// The Host starts the next Session (#164, spec #153 § API contracts): the earliest dated Session that has not started,
// if the start rule (shared/board.ts) lets it. The first start also freezes every team's Team name into event_teams and
// sets the Event to running; later starts leave both alone. Not through changeSessions: that writes the Phase from the
// Dates, and a running Event keeps its Phase. The Event row is locked, so two starts cannot both pass the rule.
export default defineEventHandler((event): Promise<SessionStarted> => changeEvent(event, { hostOnly: true, lock: 'update' }, async ({ tx, eventRow, user, publish }) => {
  const rows = await eventSessions(tx, eventRow.id)
  const { next, rejection } = startOf(eventRow, rows, (await readSeats(tx, eventRow.id)).map(seat => seat.place))
  if (rejection || next === null) throw apiError(rejection ?? 'no_dated_session')

  const first = rows.every(row => row.startedAt === null)
  await tx.update(sessions).set({ startedAt: sql`now()` }).where(eq(sessions.id, next.id))
  if (first) {
    await freezeTeamNames(tx, eventRow.id, settingsFromRow(eventRow)!.teamCount)
    await tx.update(events).set({ phase: 'running' }).where(eq(events.id, eventRow.id))
  }
  await recordActivity(tx, publish, eventRow.id, { type: 'session_started', actorId: user.id, params: { sessionId: next.id, number: await shownNumber(tx, eventRow.id, next.id) } })
  publish({ type: 'session.started', sessionId: next.id })
  if (first) publish({ type: 'team.nameFrozen' })
  return { sessionId: next.id, phase: 'running' }
}))
