import { and, asc, eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRequestURL, getRouterParam } from 'h3'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../db/schema'
import { bestSlotId, hasVoted, isPast } from '../../domain/poll'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'

// The Session link (ADR 0006): only Members can open it. A non-Member and an unknown slug get the
// same 404, so nobody can probe which Sessions exist. A former Member of a deleted Session gets
// 410 "Session deleted" instead (#10).
// Members see every Member's Votes (#1 § Data), the computed Best slot (#1 § Domain rules) and how
// many Members have voted on every votable Slot. The poll UI refetches this every 15 s (ADR 0001).
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

  const now = new Date()
  const isHost = session.hostId === user.id
  const slots = await db
    .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(eq(pollSlots.sessionId, session.id))
    .orderBy(asc(pollSlots.startsAt))

  const votes = await db
    .select({ slotId: pollVotes.slotId, userId: pollVotes.userId, value: pollVotes.value })
    .from(pollVotes)
    .innerJoin(pollSlots, eq(pollVotes.slotId, pollSlots.id))
    .where(eq(pollSlots.sessionId, session.id))

  const members = await db
    .select({ id: users.id, name: users.name, displayName: users.displayName, image: users.image })
    .from(sessionMembers)
    .innerJoin(users, eq(sessionMembers.userId, users.id))
    .where(eq(sessionMembers.sessionId, session.id))
    .orderBy(asc(sessionMembers.joinedAt))

  const votable = slots.filter(slot => !isPast(slot.startsAt, now)).map(slot => slot.id)

  return {
    session: {
      slug: session.slug,
      name: session.name,
      phase: session.phase,
      dateMode: session.dateMode,
      startsAt: session.startsAt,
      // Set while a Reopen notice is due: the Date that was withdrawn (#14). Cleared by the next Date.
      previousStartsAt: session.previousStartsAt,
      isHost,
    },
    // The Invite link is for the Host to share (#16). Members never get it, so they cannot pass it on.
    inviteUrl: isHost ? `${getRequestURL(event).origin}/s/${session.slug}-${session.inviteToken}` : null,
    viewerId: user.id,
    slots: slots.map(slot => ({
      id: slot.id,
      startsAt: slot.startsAt,
      past: isPast(slot.startsAt, now),
    })),
    votes,
    members: members.map(row => ({
      id: row.id,
      name: row.displayName ?? row.name,
      image: row.image,
      isHost: row.id === session.hostId,
    })),
    bestSlotId: bestSlotId(slots, votes, now),
    progress: {
      voted: members.filter(row => hasVoted(votable, votes, row.id)).length,
      total: members.length,
    },
  }
})
