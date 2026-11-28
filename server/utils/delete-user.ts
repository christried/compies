import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import { authAccounts, authSessions, draws, eventGameNotes, eventMembers, eventPoolGames, events, games, messages, pollVotes, rounds, users } from '../db/schema'
import type { Db } from './db'
import type { ImageStore } from './image-store'
import { endMembership } from './invite'

// Deleting a User (#681, spec #907, ADR 0020): one module, called by the route for the signed-in User on themselves (server/api/me.delete.ts), by the
// Platform admin's (server/api/admin/users/[id].delete.ts) and by `deleteAccount` (server/utils/delete-account.ts). It imports no `h3` and no Nuxt auto-import: the
// route owns the clock, the session cookie, the image store and the rooms.

export type NotDeletable = 'unknown_user' | 'already_deleted' | 'games_held'

/** The User cannot be deleted now. Nothing has changed when it is thrown. */
export class UserNotDeletable extends Error {
  readonly reason: NotDeletable
  constructor(reason: NotDeletable) {
    super(`User is not deletable: ${reason}`)
    this.reason = reason
  }
}

export interface UserDeletion {
  /** Image-store keys to delete after the commit: the profile picture's, then the key of every removed game that no game row names any more (each key once). */
  imageKeys: string[]
  /** Every not-deleted Event of another Host the User was a Member of, with the Messages that lost their text there. */
  events: { eventId: string, finished: boolean, deletedMessageIds: string[] }[]
  /** The ids of every Event the User hosted and that was removed, Deleted Events included (#917): the route tells each room `event.gone`. */
  goneEvents: string[]
}

/**
 * Deletes the User in one transaction (ADR 0020): their Messages lose their text and read „Gelöscht“, their Votes go with their Notes, their Team word is
 * cleared, their membership of every Event that has not finished ends (`endMembership`; in a finished Event they stay on their Seat or on the Stands), the provider
 * accounts and the sign-in sessions go, and the row is emptied and marked. The row itself stays: Vetoes, Activity entries and the Seat of a finished Event
 * still point at it. `now` is the caller's clock (ADR 0013); every instant written is `now`.
 *
 * A Host's Events and library go with the account (#917, ADR 0020): every Event they host is removed outright with all that hangs on it (it counts as no membership
 * below), then their games with the Tags. The one refusal is `games_held`: a game of theirs named by another Host's Event, which ADR 0018 rules out. The row's
 * last statement is the emptying, so a failure anywhere rolls the rest back with it. Throws `UserNotDeletable` for a User that is unknown, deleted already, or refused.
 */
export async function deleteUser(db: Db, userId: string, now: Date): Promise<UserDeletion> {
  return await db.transaction(async (tx) => {
    // The one lock order of every write (#991, `CODING_STANDARDS.md` § Database): the Event rows, then the users row. A change of an Event locks the Event and then, by
    // its foreign keys, the User's row, so a deletion that took the row first would wait for an Event while the change waits for the row. The Events the User hosts
    // or is a Member of are read without a lock, locked in id order (two deletions that share Events queue up instead of crossing), and only then the row.
    const hostedFirst = await tx.select({ id: events.id }).from(events).where(eq(events.hostId, userId))
    const memberOfFirst = await tx.select({ id: eventMembers.eventId }).from(eventMembers).where(eq(eventMembers.userId, userId))
    const toLock = [...new Set([...hostedFirst, ...memberOfFirst].map(found => found.id))].sort()
    if (toLock.length > 0) await tx.select({ id: events.id }).from(events).where(inArray(events.id, toLock)).orderBy(asc(events.id)).for('update')

    // A second deletion of the same User waits here and then finds the mark.
    const [row] = await tx.select({ deletedAt: users.deletedAt, profileImageKey: users.profileImageKey }).from(users).where(eq(users.id, userId)).for('update')
    if (!row) throw new UserNotDeletable('unknown_user')
    if (row.deletedAt) throw new UserNotDeletable('already_deleted')

    // The Events the User hosts, any phase, Deleted ones and a Running Session too, read again under the locks: one that was created since the first read is
    // locked here, so every Event the deletion changes is locked by it. A concurrent change of one finds no row afterwards and answers 404
    // (`loadEvent`). They go outright (ADR 0020), so they are no membership any more at step 3 and their Messages and Votes go with them.
    const hosted = (await tx.select({ id: events.id }).from(events).where(eq(events.hostId, userId)).for('update')).map(hostedEvent => hostedEvent.id)
    const owned = await tx.select({ id: games.id, imageKey: games.imageKey }).from(games).where(eq(games.createdBy, userId))
    const ownedIds = owned.map(game => game.id)

    // ADR 0018 rules out that another Host's Event holds one of these games; these four tables are every foreign key to `games` without a cascade (the guard test of
    // test/integration/delete-host.test.ts pins the list). Nothing has been deleted yet, and the thrown error rolls the transaction back anyway.
    if (ownedIds.length > 0) {
      const foreign = ne(events.hostId, userId)
      const pooled = await tx.select({ id: eventPoolGames.gameId }).from(eventPoolGames).innerJoin(events, eq(events.id, eventPoolGames.eventId)).where(and(inArray(eventPoolGames.gameId, ownedIds), foreign)).limit(1)
      const noted = await tx.select({ id: eventGameNotes.gameId }).from(eventGameNotes).innerJoin(events, eq(events.id, eventGameNotes.eventId)).where(and(inArray(eventGameNotes.gameId, ownedIds), foreign)).limit(1)
      const played = await tx.select({ id: rounds.id }).from(rounds).innerJoin(events, eq(events.id, rounds.eventId)).where(and(inArray(rounds.gameId, ownedIds), foreign)).limit(1)
      const drawn = await tx.select({ id: draws.id }).from(draws).innerJoin(rounds, eq(rounds.id, draws.roundId)).innerJoin(events, eq(events.id, rounds.eventId)).where(and(inArray(draws.gameId, ownedIds), foreign)).limit(1)
      if (pooled.length + noted.length + played.length + drawn.length > 0) throw new UserNotDeletable('games_held')
    }

    // Step 4: `event_members` is the one table that references `events` without a cascade; everything else of an Event goes with its row. A table added later that
    // does not cascade is caught by the guard test, which names this place.
    if (hosted.length > 0) {
      await tx.delete(eventMembers).where(inArray(eventMembers.eventId, hosted))
      await tx.delete(events).where(inArray(events.id, hosted))
    }
    // The library: the Tags go with their games (`game_tags` cascades) and a Tag with no game left has no row (GLOSSARY: Tag).
    if (ownedIds.length > 0) await tx.delete(games).where(eq(games.createdBy, userId))
    // An image goes unless a game of another library still names its key (a copy keeps it, ADR 0018; the rule of `image.put.ts`).
    const ownKeys = [...new Set(owned.flatMap(game => game.imageKey ? [game.imageKey] : []))]
    const stillNamed = new Set<string | null>()
    if (ownKeys.length > 0) for (const game of await tx.select({ imageKey: games.imageKey }).from(games).where(inArray(games.imageKey, ownKeys))) stillNamed.add(game.imageKey)
    const gameKeys = ownKeys.filter(key => !stillNamed.has(key))

    // Read before anything goes: the memberships decide what the rooms are told and which ones end. An Event the User joined since the first read is locked here.
    const memberships = await tx
      .select({ eventId: eventMembers.eventId, phase: events.phase, deletedAt: events.deletedAt })
      .from(eventMembers)
      .innerJoin(events, eq(events.id, eventMembers.eventId))
      .where(eq(eventMembers.userId, userId))
      .for('update', { of: events })

    // A Message the Host deleted stays as it is (`deleted_by = 'host'`).
    const lost = await tx
      .update(messages)
      .set({ text: null, deletedAt: now, deletedBy: 'writer' })
      .where(and(eq(messages.writerId, userId), isNull(messages.deletedAt)))
      .returning({ id: messages.id, eventId: messages.eventId })

    // Every Event, finished ones too; the Note is a column of the Vote.
    await tx.delete(pollVotes).where(eq(pollVotes.userId, userId))
    // A finished Event keeps Seat and zone, and its Team word goes too. A finished Event from before 0.12 keeps its Team names in `event_teams.frozen_name`, which the deletion does not clear (§ 16 of the Datenschutzerklärung, #920).
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
      imageKeys: [...(row.profileImageKey ? [row.profileImageKey] : []), ...gameKeys],
      goneEvents: hosted,
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
