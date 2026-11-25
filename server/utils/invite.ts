import { and, eq, exists, inArray, ne, sql } from 'drizzle-orm'
import { eventMembers, events, pollSlots, pollVotes } from '../db/schema'
import { parseEventPath } from '../../shared/links'
import type { Db } from './db'

// Invite link lookups (ADR 0006). The Invite link is `<slug>-<token>`; it only matches while the
// token is the Event's current one, so a rotated link stops working at once.

/** The Event an Invite link addresses, deleted Events included; null for anything else. */
export async function eventForInvite(db: Db, invite: string) {
  const link = parseEventPath(invite)
  if (link?.kind !== 'invite') return null
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, link.slug), eq(events.inviteToken, link.token)))
  return event ?? null
}

/** Whether the User is a Member of the Event, with or without a zone. */
export async function isMember(db: Db, eventId: string, userId: string) {
  const [member] = await db
    .select({ userId: eventMembers.userId })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
  return member !== undefined
}

/**
 * Makes the User a Member of the Event, on the Stands (#159, ADR 0006). Returns whether this call added them: a User who already
 * is a Member changes nothing and keeps their place. Joining and creating an Event both go through here.
 */
export async function addMember(db: Db, eventId: string, userId: string): Promise<boolean> {
  const added = await db
    .insert(eventMembers)
    .values({ eventId, userId, zone: 'stands' })
    .onConflictDoNothing({ target: [eventMembers.eventId, eventMembers.userId] })
    .returning({ userId: eventMembers.userId })
  return added.length > 0
}

/**
 * The rule that ends a membership (#681, ADR 0020): for an Event that has not finished, the User's membership row goes, with it the Seat and the
 * Team word, and so do their Votes on the Event's Slots, with their Notes. Returns whether a membership went: false for a non-Member and for a
 * finished Event, where the membership stays for good and nothing changes. Messages, Activity entries and Vetoes stay and still point at the User.
 * The caller owns the transaction and what the rooms are told (a Deleted User's deletion, 0.22's removal of a Member, #697); the Event's phase is
 * read in the same statement as the delete, so a caller cannot end a membership of a finished Event.
 */
export async function endMembership(tx: Db, eventId: string, userId: string): Promise<boolean> {
  const ended = await tx
    .delete(eventMembers)
    .where(and(
      eq(eventMembers.eventId, eventId),
      eq(eventMembers.userId, userId),
      exists(tx.select({ one: sql`1` }).from(events).where(and(eq(events.id, eventId), ne(events.phase, 'finished')))),
    ))
    .returning({ userId: eventMembers.userId })
  if (ended.length === 0) return false
  await tx
    .delete(pollVotes)
    .where(and(
      eq(pollVotes.userId, userId),
      inArray(pollVotes.slotId, tx.select({ id: pollSlots.id }).from(pollSlots).where(eq(pollSlots.eventId, eventId))),
    ))
  return true
}
