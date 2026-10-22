import { and, asc, eq, isNull } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { pollSlots, sessionMembers, sessions } from '../../db/schema'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'

// The Session link (ADR 0006): only Members can open it. A non-Member, an unknown slug and a
// deleted Session all get the same 404, so nobody can probe which Sessions exist.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const notFound = () => createError({ statusCode: 404, statusMessage: 'Session not found' })

  const db = useDb(event)
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.slug, slug), isNull(sessions.deletedAt)))
  if (!session) throw notFound()

  const [member] = await db
    .select({ userId: sessionMembers.userId })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, session.id), eq(sessionMembers.userId, user.id)))
  if (!member) throw notFound()

  const slots = await db
    .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(eq(pollSlots.sessionId, session.id))
    .orderBy(asc(pollSlots.startsAt))

  return {
    session: {
      slug: session.slug,
      name: session.name,
      phase: session.phase,
      dateMode: session.dateMode,
      startsAt: session.startsAt,
      isHost: session.hostId === user.id,
    },
    slots,
  }
})
