import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { authAccounts, authSessions, eventMembers, events, games, messages, pollVotes, users } from '../db/schema'
import type { Db } from './db'
import type { ImageStore } from './image-store'
import { endMembership } from './invite'

// Deleting a User (#681, spec #907, ADR 0020): one module, called by the route for the signed-in User on themselves (server/api/me.delete.ts) and by the
// operator's script (0.21-13, #919), which runs it against a database and a store with no request. So it imports no `h3` and no Nuxt auto-import: the
// route owns the clock, the session cookie, the image store and the rooms.

export type NotDeletable = 'unknown_user' | 'already_deleted' | 'hosts_events' | 'has_games'

/** The User cannot be deleted now. Nothing has changed when it is thrown. */
export class UserNotDeletable extends Error {
  constructor(readonly reason: NotDeletable) {
    super(`User is not deletable: ${reason}`)
  }
}

export interface UserDeletion {
  /** Image-store keys to delete after the commit (0.21-11 adds the games' images). */
  imageKeys: string[]
  /** Every not-deleted Event the User was a Member of, with the Messages that lost their text there. */
  events: { eventId: string, finished: boolean, deletedMessageIds: string[] }[]
}

/**
 * Deletes the User in one transaction (ADR 0020): their Messages lose their text and read „Gelöscht“, their Votes go with their Notes, their Team word is
 * cleared, their membership of every Event that has not finished ends (`endMembership`; in a finished Event they stay on their Seat or on the Stands), the provider
 * accounts and the sign-in sessions go, and the row is emptied and marked. The row itself stays: Vetoes, Activity entries and the Seat of a finished Event
 * still point at it. `now` is the caller's clock (ADR 0013); every instant written is `now`.
 *
 * A User who hosts an Event or has a game is refused (`hosts_events`, `has_games`) until 0.21-11 (#917) removes those instead. The row's last statement is the
 * emptying, so a failure anywhere rolls the rest back with it. Throws `UserNotDeletable` for a User that is unknown, deleted already, or refused.
 */
export async function deleteUser(db: Db, userId: string, now: Date): Promise<UserDeletion> {
  return await db.transaction(async (tx) => {
    // The row lock first: a second deletion of the same User waits here and then finds the mark.
    const [row] = await tx.select({ deletedAt: users.deletedAt, profileImageKey: users.profileImageKey }).from(users).where(eq(users.id, userId)).for('update')
    if (!row) throw new UserNotDeletable('unknown_user')
    if (row.deletedAt) throw new UserNotDeletable('already_deleted')

    // #917 replaces both refusals with the removal of those Events and games. Nothing has changed yet at this point.
    const [hosted] = await tx.select({ id: events.id }).from(events).where(eq(events.hostId, userId)).limit(1)
    if (hosted) throw new UserNotDeletable('hosts_events')
    const [owned] = await tx.select({ id: games.id }).from(games).where(eq(games.createdBy, userId)).limit(1)
    if (owned) throw new UserNotDeletable('has_games')

    // Read before anything goes: the memberships decide what the rooms are told and which ones end.
    const memberships = await tx
      .select({ eventId: eventMembers.eventId, phase: events.phase, deletedAt: events.deletedAt })
      .from(eventMembers)
      .innerJoin(events, eq(events.id, eventMembers.eventId))
      .where(eq(eventMembers.userId, userId))

    // A Message the Host deleted stays as it is (`deleted_by = 'host'`).
    const lost = await tx
      .update(messages)
      .set({ text: null, deletedAt: now, deletedBy: 'writer' })
      .where(and(eq(messages.writerId, userId), isNull(messages.deletedAt)))
      .returning({ id: messages.id, eventId: messages.eventId })

    // Every Event, finished ones too; the Note is a column of the Vote.
    await tx.delete(pollVotes).where(eq(pollVotes.userId, userId))
    // A finished Event keeps Seat and zone; its Team name was frozen at the Finish and is stored text.
    await tx.update(eventMembers).set({ teamWord: null }).where(and(eq(eventMembers.userId, userId), isNotNull(eventMembers.teamWord)))
    for (const membership of memberships) {
      if (membership.phase !== 'finished') await endMembership(tx, membership.eventId, userId)
    }

    // Straight on the tables: Better Auth's hooks (permission sync) are not wanted for an account that goes.
    await tx.delete(authSessions).where(eq(authSessions.userId, userId))
    await tx.delete(authAccounts).where(eq(authAccounts.userId, userId))

    // Last, so a failure here (the placeholder email is unique) undoes everything above.
    await tx.update(users).set({
      name: '',
      email: `${userId}@deleted.placeholder.invalid`,
      emailVerified: false,
      image: null,
      displayName: null,
      profileImageKey: null,
      canHost: false,
      isAdmin: false,
      newsSeen: null,
      tourSeen: 0,
      appearance: 'light',
      deletedAt: now,
    }).where(eq(users.id, userId))

    return {
      imageKeys: row.profileImageKey ? [row.profileImageKey] : [],
      events: memberships
        .filter(membership => membership.deletedAt === null)
        .map(membership => ({
          eventId: membership.eventId,
          finished: membership.phase === 'finished',
          deletedMessageIds: lost.filter(message => message.eventId === membership.eventId).map(message => message.id),
        })),
    }
  })
}

/** Deletes the objects after the commit: a failure is logged and the object left, never thrown (an orphan costs nothing; the deletion went through). */
export async function removeImages(store: ImageStore, keys: readonly string[]): Promise<void> {
  for (const key of keys) await store.delete(key).catch(failure => console.error('Image cleanup failed', key, failure))
}
