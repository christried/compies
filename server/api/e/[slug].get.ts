import { asc, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { pollSlots, pollVotes, eventMembers, users } from '../../db/schema'
import { isPast, pollStanding } from '../../domain/poll'
import { missingDates, openSlots, sessionNumbers } from '../../domain/session'
import { useDb } from '../../utils/db'
import { inviteUrl } from '../../utils/links'
import { loadEvent } from '../../utils/event-access'
import { eventSessions, removedSessionNotices } from '../../utils/sessions'
import { requireUser } from '../../utils/user'

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
  const removed = await removedSessionNotices(db, eventRow.id)
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

  // Sessions with a Date come first in Date order and get their number (#49); the Sessions still
  // waiting for a Date follow and only count as missing Dates.
  const numbers = sessionNumbers(rows.map(row => row.startsAt))
  const sessionViews = rows
    .map((row, index) => ({ row, number: numbers[index] ?? null }))
    .sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER))

  return {
    event: {
      slug: eventRow.slug,
      name: eventRow.name,
      phase: eventRow.phase,
      isHost,
    },
    // Each Session's Date; a Session's previousStartsAt is set while a Reopen notice is due (#14).
    sessions: sessionViews.map(({ row, number }) => ({
      id: row.id,
      number,
      startsAt: row.startsAt?.toISOString() ?? null,
      previousStartsAt: row.previousStartsAt?.toISOString() ?? null,
    })),
    // Removed Sessions that had a Date, only for their notice (#65); they count nowhere else.
    removedSessions: removed.map(row => ({ id: row.id, previousStartsAt: row.previousStartsAt.toISOString() })),
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
