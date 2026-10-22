import { and, eq, inArray, isNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../db/schema'
import { arrangeHome, homeAction, needsVote } from '../../domain/home'
import { bestSlotId, hasVoted, isPast } from '../../domain/poll'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'

// Home (#12, screen M1): every Session the User is a Member of, not deleted, in Home order. Each card
// carries what the card shows: the Host, the phase, the Best slot or the Date, how many Members have
// voted, the User's own status and the call to action. Dates more than 24 h past are left out.
// Pure rules live in server/domain/home.ts; this handler only loads the rows.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const now = new Date()

  const rows = await db
    .select({
      id: sessions.id,
      slug: sessions.slug,
      name: sessions.name,
      phase: sessions.phase,
      dateMode: sessions.dateMode,
      startsAt: sessions.startsAt,
      createdAt: sessions.createdAt,
      hostId: sessions.hostId,
      hostName: users.name,
      hostDisplayName: users.displayName,
    })
    .from(sessionMembers)
    .innerJoin(sessions, eq(sessionMembers.sessionId, sessions.id))
    .innerJoin(users, eq(sessions.hostId, users.id))
    .where(and(eq(sessionMembers.userId, user.id), isNull(sessions.deletedAt)))

  if (rows.length === 0) return { sessions: [] }
  const sessionIds = rows.map(row => row.id)

  const slots = await db
    .select({ id: pollSlots.id, sessionId: pollSlots.sessionId, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(inArray(pollSlots.sessionId, sessionIds))

  const votes = await db
    .select({ slotId: pollVotes.slotId, userId: pollVotes.userId, value: pollVotes.value, sessionId: pollSlots.sessionId })
    .from(pollVotes)
    .innerJoin(pollSlots, eq(pollVotes.slotId, pollSlots.id))
    .where(inArray(pollSlots.sessionId, sessionIds))

  const members = await db
    .select({ sessionId: sessionMembers.sessionId, userId: sessionMembers.userId })
    .from(sessionMembers)
    .where(inArray(sessionMembers.sessionId, sessionIds))

  const cards = rows.map((row) => {
    const sessionSlots = slots.filter(slot => slot.sessionId === row.id)
    const sessionVotes = votes.filter(vote => vote.sessionId === row.id)
    const memberIds = members.filter(member => member.sessionId === row.id).map(member => member.userId)
    const votable = sessionSlots.filter(slot => !isPast(slot.startsAt, now)).map(slot => slot.id)
    const best = sessionSlots.find(slot => slot.id === bestSlotId(sessionSlots, sessionVotes, now))
    const isHost = row.hostId === user.id
    const toBeVoted = needsVote(row.phase, votable, sessionVotes, user.id)

    return {
      slug: row.slug,
      name: row.name,
      host: { name: row.hostDisplayName ?? row.hostName },
      phase: row.phase,
      dateMode: row.dateMode,
      startsAt: row.startsAt,
      createdAt: row.createdAt,
      bestSlot: best ? { id: best.id, startsAt: best.startsAt } : null,
      progress: {
        voted: memberIds.filter(id => hasVoted(votable, sessionVotes, id)).length,
        total: memberIds.length,
      },
      viewerVoted: hasVoted(votable, sessionVotes, user.id),
      isHost,
      action: homeAction({ isHost, needsVote: toBeVoted }),
      needsVote: toBeVoted,
    }
  })

  return {
    sessions: arrangeHome(cards, now).map(({ startsAt, createdAt, bestSlot, needsVote: _needsVote, ...card }) => ({
      ...card,
      startsAt: startsAt?.toISOString() ?? null,
      createdAt: createdAt.toISOString(),
      bestSlot: bestSlot ? { id: bestSlot.id, startsAt: bestSlot.startsAt.toISOString() } : null,
    })),
  }
})
