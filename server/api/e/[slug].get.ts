import { asc, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { pollSlots, pollVotes, eventMembers, users } from '../../db/schema'
import { isPast, pollStanding } from '../../domain/poll'
import { useDb } from '../../utils/db'
import { inviteUrl } from '../../utils/links'
import { loadEvent } from '../../utils/event-access'
import { requireUser } from '../../utils/user'

// The Event link (ADR 0006): only Members can open it. A non-Member and an unknown slug get the
// same 404, so nobody can probe which Events exist. A former Member of a deleted Event gets
// 410 "Event deleted" instead (#10).
// Members see every Member's Votes (#1 § Data), the computed Best slot (#1 § Domain rules) and how
// many Members have voted on every votable Slot. The poll UI refetches this every 15 s (ADR 0001).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)

  const now = new Date()
  const isHost = eventRow.hostId === user.id
  const slots = await db
    .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(eq(pollSlots.eventId, eventRow.id))
    .orderBy(asc(pollSlots.startsAt))

  const votes = await db
    .select({ slotId: pollVotes.slotId, userId: pollVotes.userId, value: pollVotes.value })
    .from(pollVotes)
    .innerJoin(pollSlots, eq(pollVotes.slotId, pollSlots.id))
    .where(eq(pollSlots.eventId, eventRow.id))

  const members = await db
    .select({ id: users.id, name: users.name, displayName: users.displayName, image: users.image })
    .from(eventMembers)
    .innerJoin(users, eq(eventMembers.userId, users.id))
    .where(eq(eventMembers.eventId, eventRow.id))
    .orderBy(asc(eventMembers.joinedAt))

  const standing = pollStanding({ slots, votes, memberIds: members.map(row => row.id), viewerId: user.id, now })

  return {
    event: {
      slug: eventRow.slug,
      name: eventRow.name,
      phase: eventRow.phase,
      dateMode: eventRow.dateMode,
      startsAt: eventRow.startsAt,
      // Set while a Reopen notice is due: the Date that was withdrawn (#14). Cleared by the next Date.
      previousStartsAt: eventRow.previousStartsAt,
      isHost,
    },
    // The Invite link is for the Host to share (#16). Members never get it, so they cannot pass it on.
    inviteUrl: isHost ? inviteUrl(event, eventRow.slug, eventRow.inviteToken) : null,
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
      isHost: row.id === eventRow.hostId,
    })),
    bestSlotId: standing.bestSlot?.id ?? null,
    progress: standing.progress,
  }
})
