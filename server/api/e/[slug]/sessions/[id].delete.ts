import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../../db/schema'
import { removeSessionRejection } from '../../../../domain/phase'
import { sequenceRaises } from '../../../../domain/session'
import { useDb } from '../../../../utils/db'
import { apiError, sessionNotFound } from '../../../../utils/errors'
import { loadEvent } from '../../../../utils/event-access'
import { eventSessions, raiseSequences, setEventPhase } from '../../../../utils/sessions'
import { requireUser } from '../../../../utils/user'

// Removes one Session of an Event (#55, ADR 0011), dated or not. Its Slot, if its Date came from one, goes back
// to the poll with its Votes, because the Slot is open again once no Session refers to it. The last Session
// of an Event cannot be removed. The Event row is locked, so a removal that races a confirm cannot leave a
// wrong Phase or a Slot held by a removed Session. The Sessions whose number changes get a higher SEQUENCE.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const sessionId = getRouterParam(event, 'id') ?? ''

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { hostOnly: true, lock: 'update' })
    const before = await eventSessions(tx, eventRow.id)
    const session = before.find(row => row.id === sessionId)
    if (!session) throw sessionNotFound()

    const rejection = removeSessionRejection({ phase: eventRow.phase, count: before.length })
    if (rejection) throw apiError(rejection)

    await tx.delete(sessions).where(eq(sessions.id, session.id))

    const after = before.filter(row => row.id !== session.id)
    await raiseSequences(tx, sequenceRaises(before, after))
    return { phase: await setEventPhase(tx, eventRow.id, after.map(row => row.startsAt)), id: session.id }
  })
})
