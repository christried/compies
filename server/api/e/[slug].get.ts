import { asc, eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { pollSlots, pollVotes, eventMembers, users } from '../../db/schema'
import { poolsVisibleTo } from '../../domain/pool-visibility'
import { isPast, pollStanding } from '../../domain/poll'
import { missingDates, numberedSessions, openPoll } from '../../domain/session'
import { useDb } from '../../utils/db'
import { inviteUrl } from '../../utils/links'
import { loadEvent } from '../../utils/event-access'
import { eventPools } from '../../utils/pools'
import { SETTINGS_FLOORS } from '../../utils/settings-floors'
import { eventSessions, removedSessionNotices } from '../../utils/sessions'
import { requireUser } from '../../utils/user'
import type { EventView, SessionNote, SessionView } from '../../../shared/event'
import type { VoteRow } from '../../../shared/poll'
import { settingsFromRow } from '../../../shared/settings'

// The Event link (ADR 0006): only Members can open it. A non-Member and an unknown slug get the
// same 404, so nobody can probe which Events exist. A former Member of a deleted Event gets
// 410 "Event deleted" instead (#10).
// Members see the open Slots only (#52): a Slot that became a Session's Date is gone from the poll, with
// its Votes. The Best slot and how many Members have voted on every votable Slot count open future Slots.
// The poll UI refetches this every 15 s (ADR 0001).
export default defineEventHandler(async (event): Promise<EventView> => {
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
  const allVotes = await db
    .select({ slotId: pollVotes.slotId, userId: pollVotes.userId, value: pollVotes.value, note: pollVotes.note })
    .from(pollVotes)
    .innerJoin(pollSlots, eq(pollVotes.slotId, pollSlots.id))
    .where(eq(pollSlots.eventId, eventRow.id))
  const { slots, votes } = openPoll(allSlots, rows.map(row => row.slotId), allVotes)

  const members = await db
    .select({ id: users.id, name: users.name, displayName: users.displayName, image: users.image })
    .from(eventMembers)
    .innerJoin(users, eq(eventMembers.userId, users.id))
    .where(eq(eventMembers.eventId, eventRow.id))
    .orderBy(asc(eventMembers.joinedAt))

  const settings = settingsFromRow(eventRow)
  const standing = pollStanding({ slots, votes, memberIds: members.map(row => row.id), viewerId: user.id, now })

  return {
    event: {
      slug: eventRow.slug,
      name: eventRow.name,
      phase: eventRow.phase,
      isHost,
    },
    settings,
    settingsFloors: isHost ? SETTINGS_FLOORS : null,
    // The Host sees the games of both pools; every other Member only while the wheel is not hidden, else how many
    // there are (#146, #148). Under a Hidden wheel NO other field of this response may carry a pool game (name, id,
    // image key, video id): the Members, Sessions and Votes above and below must stay free of them. The test
    // hidden-wheel.test.ts reads the raw response to keep it so.
    pools: await eventPools(db, eventRow.id, poolsVisibleTo({ isHost, settings })),
    // Sessions with a Date come first in Date order, with the number they are shown with (#49, #70); the
    // Sessions still waiting for a Date follow and only count as missing Dates.
    sessions: numberedSessions(rows).map(row => sessionView(row, allVotes)),
    // Removed Sessions that had a Date, only for their notice (#65); they count nowhere else.
    removedSessions: removed.map(row => ({ id: row.id, previousStartsAt: row.previousStartsAt.toISOString() })),
    missingDates: missingDates(rows.map(row => row.startsAt)),
    // The Invite link is for the Host to share (#16). Members never get it, so they cannot pass it on.
    inviteUrl: isHost ? inviteUrl(event, eventRow.slug, eventRow.inviteToken) : null,
    viewerId: user.id,
    slots: slots.map(slot => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
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
function sessionView(
  session: { id: string, number: number | null, startsAt: Date | null, previousStartsAt: Date | null, slotId: string | null },
  votes: VoteRow[],
): SessionView {
  return session.startsAt === null
    ? { id: session.id, number: null, startsAt: null, previousStartsAt: session.previousStartsAt?.toISOString() ?? null }
    : { id: session.id, number: session.number, startsAt: session.startsAt.toISOString(), previousStartsAt: null, notes: notesOn(session.slotId, votes) }
}

/** The Notes on a Slot (#102), for the Session whose Date came from it. */
function notesOn(slotId: string | null, votes: VoteRow[]): SessionNote[] {
  return votes.flatMap(vote => vote.slotId === slotId && vote.note !== null ? [{ userId: vote.userId, value: vote.value, note: vote.note }] : [])
}
