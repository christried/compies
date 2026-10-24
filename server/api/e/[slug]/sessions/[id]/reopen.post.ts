import { eq, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../../../db/schema'
import { reopenRejection } from '../../../../../domain/phase'
import { apiError } from '../../../../../utils/errors'
import { changeSessions, findSession } from '../../../../../utils/sessions'

// Reopen of one Session (#14, #55, ADR 0011): the Host withdraws that Session's set Date. The old Date is kept
// as its previousStartsAt, so every Member sees the notice to delete it from their calendar. The Session's
// Slot is freed, so the Slot is back in the poll with its Votes. The other Sessions keep their Dates and Slots.
// The Event row is locked, so a Reopen that races a confirm or another change cannot write over it. Every
// Session whose entry changed gets its calendar SEQUENCE raised, the withdrawn one included.
export default defineEventHandler(event => changeSessions(event, async ({ tx, eventRow, sessions: before }) => {
  const session = findSession(before, getRouterParam(event, 'id'))
  const rejection = reopenRejection({ phase: eventRow.phase, hasDate: session.startsAt !== null })
  if (rejection) throw apiError(rejection)

  // The old Date is read in the same UPDATE that clears it: Postgres evaluates SET against the old row.
  await tx
    .update(sessions)
    .set({ startsAt: null, slotId: null, previousStartsAt: sql`${sessions.startsAt}` })
    .where(eq(sessions.id, session.id))
  return {}
}))
