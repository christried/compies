import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { sessionNotFound } from '../../utils/errors'
import { sessionForInvite } from '../../utils/invite'

// Signed-out preview of an Invite link (screen 07, ADR 0006): the Session name and the Host's
// Display name and avatar. Nothing else, so no Slots, Votes or Members leak to a visitor.
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const session = await sessionForInvite(db, getRouterParam(event, 'invite') ?? '')
  if (!session || session.deletedAt) throw sessionNotFound()

  const [host] = await db
    .select({ name: users.name, displayName: users.displayName, image: users.image })
    .from(users)
    .where(eq(users.id, session.hostId))

  return {
    sessionName: session.name,
    host: { name: host!.displayName ?? host!.name, image: host!.image },
  }
})
