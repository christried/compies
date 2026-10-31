import { eq, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../../db/schema'
import { removeSessionRejection } from '../../../../domain/phase'
import { recordActivity } from '../../../../utils/activity'
import { apiError } from '../../../../utils/errors'
import { changeSessions, findSession, shownNumber } from '../../../../utils/sessions'
import type { SessionRemoved } from '../../../../../shared/event'

// Removes one Session of an Event (#55, ADR 0011), dated or not. Its Slot, if its Date came from one, goes back
// to the poll with its Votes, because the Slot is open again once no Session refers to it. The last Session
// of an Event cannot be removed. The Event row is locked, so a removal that races a confirm cannot leave a
// wrong Phase or a Slot held by a removed Session. The Sessions whose number changes get a higher SEQUENCE.
// A Session that has, or had, a Date stays as a removed row with that Date (#65), so every Member still sees
// the notice to delete the evening from their calendar; it counts nowhere else (eventSessions leaves it out).
// A Session that never had a Date leaves nothing to tell, so it is really deleted. A Session that has started is not
// removed at all (#164).
export default defineEventHandler((event): Promise<SessionRemoved> => changeSessions(event, async ({ tx, eventRow, user, publish, sessions: before }) => {
  const session = findSession(before, getRouterParam(event, 'id'))
  const rejection = removeSessionRejection({ phase: eventRow.phase, count: before.length, started: session.startedAt !== null })
  if (rejection) throw apiError(rejection)

  // The number the Session was shown with, before it is gone (#159).
  const number = await shownNumber(tx, eventRow.id, session.id)
  const withdrawn = session.startsAt ?? session.previousStartsAt
  if (withdrawn === null) {
    await tx.delete(sessions).where(eq(sessions.id, session.id))
  }
  else {
    await tx
      .update(sessions)
      .set({ removedAt: sql`now()`, previousStartsAt: withdrawn, startsAt: null, slotId: null })
      .where(eq(sessions.id, session.id))
  }
  await recordActivity(tx, publish, eventRow.id, { type: 'session_removed', actorId: user.id, params: { sessionId: session.id, number, startsAt: session.startsAt?.toISOString() ?? null } })
  return { id: session.id }
}))
