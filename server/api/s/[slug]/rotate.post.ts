import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRequestURL, getRouterParam } from 'h3'
import { sessionMembers, sessions } from '../../../db/schema'
import { createInviteToken } from '../../../domain/slug'
import { useDb } from '../../../utils/db'
import { requireUser } from '../../../utils/user'

// Rotate the Invite link (#16, ADR 0006): a new token and the same slug. The old Invite link answers
// the generic 404 from now on. Members keep their Session link, because they are in session_members,
// which rotation does not touch. Only the Host may rotate (ADR 0002: losing canHost keeps the Session).
// Non-Members get the same 404 as an unknown slug, so Sessions cannot be probed.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const notFound = () => createError({ statusCode: 404, statusMessage: 'Session not found' })

  const db = useDb(event)
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.slug, slug))
  if (!session) throw notFound()

  const [member] = await db
    .select({ userId: sessionMembers.userId })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, session.id), eq(sessionMembers.userId, user.id)))
  if (!member) throw notFound()
  if (session.deletedAt) throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
  if (session.hostId !== user.id) throw createError({ statusCode: 403, statusMessage: 'Host only' })

  const inviteToken = createInviteToken()
  await db.update(sessions).set({ inviteToken }).where(eq(sessions.id, session.id))

  return { inviteUrl: `${getRequestURL(event).origin}/s/${slug}-${inviteToken}` }
})
