import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { sessions } from '../../../db/schema'
import { createInviteToken } from '../../../domain/slug'
import { useDb } from '../../../utils/db'
import { inviteUrl } from '../../../utils/links'
import { loadSession } from '../../../utils/session-access'
import { requireUser } from '../../../utils/user'

// Rotate the Invite link (#16, ADR 0006): a new token and the same slug. The old Invite link answers
// the generic 404 from now on. Members keep their Session link, because they are in session_members,
// which rotation does not touch. Only the Host may rotate (ADR 0002: losing canHost keeps the Session).
// Non-Members get the same 404 as an unknown slug, so Sessions cannot be probed.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const session = await loadSession(db, getRouterParam(event, 'slug') ?? '', user.id, { hostOnly: true })

  const inviteToken = createInviteToken()
  await db.update(sessions).set({ inviteToken }).where(eq(sessions.id, session.id))

  return { inviteUrl: inviteUrl(event, session.slug, inviteToken) }
})
