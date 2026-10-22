import { createError, defineEventHandler, getRouterParam } from 'h3'
import { sessionMembers } from '../../db/schema'
import { useDb } from '../../utils/db'
import { isMember, sessionForInvite, sessionNotFound } from '../../utils/invite'
import { requireUser } from '../../utils/user'

// Join a Session through its Invite link (#10, ADR 0006): the signed-in User becomes a Member on
// the Bench. Joining again changes nothing and keeps the zone. The answer names the Session link
// the page moves on to, and whether this call added the Member.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const session = await sessionForInvite(db, getRouterParam(event, 'invite') ?? '')
  if (!session) throw sessionNotFound()

  if (session.deletedAt) {
    // Only a former Member learns that the Session was deleted; everyone else gets the generic answer.
    if (await isMember(db, session.id, user.id)) {
      throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
    }
    throw sessionNotFound()
  }

  const added = await db
    .insert(sessionMembers)
    .values({ sessionId: session.id, userId: user.id })
    .onConflictDoNothing({ target: [sessionMembers.sessionId, sessionMembers.userId] })
    .returning({ userId: sessionMembers.userId })

  return { slug: session.slug, joined: added.length > 0 }
})
