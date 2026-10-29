import { and, eq } from 'drizzle-orm'
import { eventMembers, events } from '../db/schema'
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
 * Makes the User a Member of the Event, on the Bench (#159). Returns whether this call added them: a User who already
 * is a Member changes nothing and keeps their place. Joining and creating an Event both go through here.
 */
export async function addMember(db: Db, eventId: string, userId: string): Promise<boolean> {
  const added = await db
    .insert(eventMembers)
    .values({ eventId, userId })
    .onConflictDoNothing({ target: [eventMembers.eventId, eventMembers.userId] })
    .returning({ userId: eventMembers.userId })
  return added.length > 0
}
