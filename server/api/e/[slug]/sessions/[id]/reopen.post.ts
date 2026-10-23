import { eq, sql } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../../../db/schema'
import { reopenRejection, reopenValues } from '../../../../../domain/phase'
import { sequenceRaises } from '../../../../../domain/session'
import { useDb } from '../../../../../utils/db'
import { apiError, sessionNotFound } from '../../../../../utils/errors'
import { loadEvent } from '../../../../../utils/event-access'
import { eventSessions, raiseSequences, setEventPhase } from '../../../../../utils/sessions'
import { requireUser } from '../../../../../utils/user'

// Reopen of one Session (#14, #55, ADR 0011): the Host withdraws that Session's set Date. The old Date is kept
// as its previousStartsAt, so every Member sees the notice to delete it from their calendar. The Session's
// Slot is freed, so the Slot is back in the poll with its Votes. The other Sessions keep their Dates and Slots.
// The Event row is locked, so a Reopen that races a confirm or another change cannot write over it. Every
// Session whose entry changed gets its calendar SEQUENCE raised, the withdrawn one included.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const sessionId = getRouterParam(event, 'id') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })
    const before = await eventSessions(tx, eventRow.id)
    const session = before.find(row => row.id === sessionId)
    if (!session) throw sessionNotFound()

    const rejection = reopenRejection({ phase: eventRow.phase, hasDate: session.startsAt !== null })
    if (rejection) throw apiError(rejection)

    // The old Date is read in the same UPDATE that clears it: Postgres evaluates SET against the old row.
    await tx
      .update(sessions)
      .set({ ...reopenValues(), previousStartsAt: sql`${sessions.startsAt}` })
      .where(eq(sessions.id, session.id))

    const after = before.map(row => (row.id === session.id ? { ...row, ...reopenValues() } : row))
    await raiseSequences(tx, sequenceRaises(before, after))
    return { phase: await setEventPhase(tx, eventRow.id, after.map(row => row.startsAt)) }
  })
})
