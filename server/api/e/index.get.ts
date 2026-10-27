import { and, eq, inArray, isNull } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { pollSlots, pollVotes, eventMembers, events, sessions, users } from '../../db/schema'
import { arrangeHome, homeAction, homeSession, needsVote } from '../../domain/home'
import { pollStanding } from '../../domain/poll'
import { missingDates, numberedSessions, openSlots } from '../../domain/session'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'
import type { HomeEvent, HomeView } from '../../../shared/event'

// Home (#12, screen M1): every Event the User is a Member of, not deleted, in Home order. Each card
// carries what the card shows: the Host, the phase, the Best slot or the next Session, the Sessions
// still waiting for a Date, how many Members have voted, the User's own status and the call to action.
// Events whose Sessions have all passed by more than 24 h are left out (#54).
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

  const sessionRows = await db
    .select({ id: sessions.id, eventId: sessions.eventId, startsAt: sessions.startsAt, slotId: sessions.slotId })
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
    const eventSessionRows = sessionRows.filter(session => session.eventId === row.id)
    const sessionStarts = eventSessionRows.map(session => session.startsAt)
    // The card names the number the Session is shown with (#70): none while the Event has one Session.
    const next = homeSession(numberedSessions(eventSessionRows), now)
    // Only open Slots count for the Best slot, progress and the vote call to action (#52, #54): a Slot that a Session has as its Date is closed.
    const eventSlots = openSlots(slots.filter(slot => slot.eventId === row.id), eventSessionRows.map(session => session.slotId))
    const openIds = new Set(eventSlots.map(slot => slot.id))
    const eventVotes = votes.filter(vote => vote.eventId === row.id && openIds.has(vote.slotId))
    const standing = pollStanding({
      slots: eventSlots,
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
      sessionCount: sessionStarts.length,
      missingDates: missingDates(sessionStarts),
      nextSession: next && { number: next.number, startsAt: next.startsAt.toISOString() },
      createdAt: row.createdAt.toISOString(),
      bestSlot: standing.bestSlot && { id: standing.bestSlot.id, startsAt: standing.bestSlot.startsAt.toISOString() },
      progress: standing.progress,
      viewerVoted: standing.viewerVoted,
      isHost,
      action: homeAction({ isHost, needsVote: viewerNeedsVote }),
    }
    // Home order reads the row's own times and whether the viewer still has to vote.
    return { card, phase: row.phase, needsVote: viewerNeedsVote, sessionStarts, createdAt: row.createdAt }
  })

  return { events: arrangeHome(cards, now).map(entry => entry.card) }
})
