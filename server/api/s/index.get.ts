import { and, eq, inArray, isNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { pollSlots, pollVotes, sessionMembers, sessions, users } from '../../db/schema'
import { arrangeHome, homeAction, needsVote } from '../../domain/home'
import { pollStanding } from '../../domain/poll'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'
import type { HomeSession, HomeView } from '../../../shared/session'

// Home (#12, screen M1): every Session the User is a Member of, not deleted, in Home order. Each card
// carries what the card shows: the Host, the phase, the Best slot or the Date, how many Members have
// voted, the User's own status and the call to action. Dates more than 24 h past are left out.
// Pure rules live in server/domain/home.ts and poll.ts; this handler only loads the rows.
export default defineEventHandler(async (event): Promise<HomeView> => {
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
    const sessionVotes = votes.filter(vote => vote.sessionId === row.id)
    const standing = pollStanding({
      slots: slots.filter(slot => slot.sessionId === row.id),
      votes: sessionVotes,
      memberIds: members.filter(member => member.sessionId === row.id).map(member => member.userId),
      viewerId: user.id,
      now,
    })
    const isHost = row.hostId === user.id
    const viewerNeedsVote = needsVote(row.phase, standing.votableSlotIds, sessionVotes, user.id)
    const card: HomeSession = {
      slug: row.slug,
      name: row.name,
      host: { name: row.hostDisplayName ?? row.hostName },
      phase: row.phase,
      dateMode: row.dateMode,
      startsAt: row.startsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      bestSlot: standing.bestSlot && { id: standing.bestSlot.id, startsAt: standing.bestSlot.startsAt.toISOString() },
      progress: standing.progress,
      viewerVoted: standing.viewerVoted,
      isHost,
      action: homeAction({ isHost, needsVote: viewerNeedsVote }),
    }
    // Home order reads the row's own times and whether the viewer still has to vote.
    return { card, phase: row.phase, needsVote: viewerNeedsVote, startsAt: row.startsAt, createdAt: row.createdAt }
  })

  return { sessions: arrangeHome(cards, now).map(entry => entry.card) }
})
