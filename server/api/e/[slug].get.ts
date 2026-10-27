import { asc, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { pollSlots, pollVotes, eventMembers, users } from '../../db/schema'
import { isPast, pollStanding } from '../../domain/poll'
import { missingDates, numberedSessions, openSlots } from '../../domain/session'
import { useDb } from '../../utils/db'
import { inviteUrl } from '../../utils/links'
import { loadEvent } from '../../utils/event-access'
import { eventSessions } from '../../utils/sessions'
import { requireUser } from '../../utils/user'
import type { SessionView } from '../../../shared/event'

// The Event link (ADR 0006): only Members can open it. A non-Member and an unknown slug get the
// same 404, so nobody can probe which Events exist. A former Member of a deleted Event gets
// 410 "Event deleted" instead (#10).
// Members see the open Slots only (#52): a Slot that became a Session's Date is gone from the poll, with
// its Votes. The Best slot and how many Members have voted on every votable Slot count open future Slots.
// The poll UI refetches this every 15 s (ADR 0001).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)

  const now = new Date()
  const isHost = eventRow.hostId === user.id
  const rows = await eventSessions(db, eventRow.id)
  const allSlots = await db
    .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
    .from(pollSlots)
    .where(eq(pollSlots.eventId, eventRow.id))
    .orderBy(asc(pollSlots.startsAt))
  const slots = openSlots(allSlots, rows.map(row => row.slotId))
  const openIds = new Set(slots.map(slot => slot.id))

  const votes = (await db
    .select({ slotId: pollVotes.slotId, userId: pollVotes.userId, value: pollVotes.value })
    .from(pollVotes)
    .innerJoin(pollSlots, eq(pollVotes.slotId, pollSlots.id))
    .where(eq(pollSlots.eventId, eventRow.id))).filter(vote => openIds.has(vote.slotId))

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
      isHost,
    },
    // Sessions with a Date come first in Date order, with the number they are shown with (#49, #70); the
    // Sessions still waiting for a Date follow and only count as missing Dates.
    sessions: numberedSessions(rows).map(sessionView),
    missingDates: missingDates(rows.map(row => row.startsAt)),
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

/**
 * A Session as the Event page gets it (#14, #70): a dated one with its Date and the number it is shown with, an
 * undated one with the Date a Reopen withdrew while that notice is due.
 */
function sessionView(session: { id: string, number: number | null, startsAt: Date | null, previousStartsAt: Date | null }): SessionView {
  return session.startsAt === null
    ? { id: session.id, number: null, startsAt: null, previousStartsAt: session.previousStartsAt?.toISOString() ?? null }
    : { id: session.id, number: session.number, startsAt: session.startsAt.toISOString(), previousStartsAt: null }
}
