import { and, eq, inArray, isNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../db/schema'
import { arrangeHome, homeAction, needsVote } from '../../domain/home'
import { pollStanding } from '../../domain/poll'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'
import type { HomeEvent, HomeView } from '../../../shared/event'

// Home (#12, screen M1): every Event the User is a Member of, not deleted, in Home order. Each card
// carries what the card shows: the Host, the phase, the Best slot or the Date, how many Members have
// voted, the User's own status and the call to action. Dates more than 24 h past are left out.
// Pure rules live in server/domain/home.ts and poll.ts; this handler only loads the rows.
export default defineEventHandler(async (event): Promise<HomeView> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const now = new Date()

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      phase: events.phase,
      createdAt: events.createdAt,
      hostId: events.hostId,
      hostName: users.name,
      hostDisplayName: users.displayName,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .innerJoin(users, eq(events.hostId, users.id))
    .where(and(eq(eventMembers.userId, user.id), isNull(events.deletedAt)))

  if (rows.length === 0) return { events: [] }
  const eventIds = rows.map(row => row.id)

  // Until several Sessions per Event come with #49, an Event's Date is its first Session's.
  const dates = await db
    .select({ eventId: sessions.eventId, startsAt: sessions.startsAt })
    .from(sessions)
    .where(inArray(sessions.eventId, eventIds))

  const slots = await db
    .select({ id: pollSlots.id, eventId: pollSlots.eventId, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(inArray(pollSlots.eventId, eventIds))

  const votes = await db
    .select({ slotId: pollVotes.slotId, userId: pollVotes.userId, value: pollVotes.value, eventId: pollSlots.eventId })
    .from(pollVotes)
    .innerJoin(pollSlots, eq(pollVotes.slotId, pollSlots.id))
    .where(inArray(pollSlots.eventId, eventIds))

  const members = await db
    .select({ eventId: eventMembers.eventId, userId: eventMembers.userId })
    .from(eventMembers)
    .where(inArray(eventMembers.eventId, eventIds))

  const cards = rows.map((row) => {
    const startsAt = dates.find(date => date.eventId === row.id)?.startsAt ?? null
    const eventVotes = votes.filter(vote => vote.eventId === row.id)
    const standing = pollStanding({
      slots: slots.filter(slot => slot.eventId === row.id),
      votes: eventVotes,
      memberIds: members.filter(member => member.eventId === row.id).map(member => member.userId),
      viewerId: user.id,
      now,
    })
    const isHost = row.hostId === user.id
    const viewerNeedsVote = needsVote(row.phase, standing.votableSlotIds, eventVotes, user.id)
    const card: HomeEvent = {
      slug: row.slug,
      name: row.name,
      host: { name: row.hostDisplayName ?? row.hostName },
      phase: row.phase,
      startsAt: startsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      bestSlot: standing.bestSlot && { id: standing.bestSlot.id, startsAt: standing.bestSlot.startsAt.toISOString() },
      progress: standing.progress,
      viewerVoted: standing.viewerVoted,
      isHost,
      action: homeAction({ isHost, needsVote: viewerNeedsVote }),
    }
    // Home order reads the row's own times and whether the viewer still has to vote.
    return { card, phase: row.phase, needsVote: viewerNeedsVote, startsAt, createdAt: row.createdAt }
  })

  return { events: arrangeHome(cards, now).map(entry => entry.card) }
})
