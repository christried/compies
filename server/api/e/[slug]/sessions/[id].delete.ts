import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../../db/schema'
import { removeSessionRejection } from '../../../../domain/phase'
import { apiError } from '../../../../utils/errors'
import { changeSessions, findSession } from '../../../../utils/sessions'

// Removes one Session of an Event (#55, ADR 0011), dated or not. Its Slot, if its Date came from one, goes back
// to the poll with its Votes, because the Slot is open again once no Session refers to it. The last Session
// of an Event cannot be removed. The Event row is locked, so a removal that races a confirm cannot leave a
// wrong Phase or a Slot held by a removed Session. The Sessions whose number changes get a higher SEQUENCE.
export default defineEventHandler(event => changeSessions(event, async ({ tx, eventRow, sessions: before }) => {
  const session = findSession(before, getRouterParam(event, 'id'))
  const rejection = removeSessionRejection({ phase: eventRow.phase, count: before.length })
  if (rejection) throw apiError(rejection)

  await tx.delete(sessions).where(eq(sessions.id, session.id))
  return { id: session.id }
}))
