import { and, count, eq, isNull } from 'drizzle-orm'
import * as schema from '../db/schema'
import type { Db } from './db'
import type { deleteUser, removeImages, UserNotDeletable } from './delete-user'
import type { ImageStore } from './image-store'

// The deletion of one account as a report (#919, #941): the counts, the deletion of server/utils/delete-user.ts in one transaction, and the images. The Admin page's
// counts (`GET /api/admin/users/:id/deletion`) are its dry run. No connection of its own, no console output, so test/integration/delete-account-report.test.ts
// drives it on PGlite with the real module. It never holds a name, an address or a Message's text: counts and Event ids are all it reads out.

/** A reason the deletion does not run, in a line that names no User, no URL and no driver message. */
export class Stopped extends Error {
  /** The module's reason (`UserNotDeletable.reason`), for the Admin page's route (#941), which answers by it. */
  readonly reason: string | undefined
  constructor(message: string, reason?: string) {
    super(message)
    this.reason = reason
  }
}

/** Thrown at the end of a dry run, so the transaction that holds the whole deletion rolls back. It never leaves `deleteAccount`. */
class DryRun extends Error {}

/** What the deletion removes or ends, all counts and Event ids. */
export interface Report {
  /** The Events the User hosted, removed with everything on them (Deleted ones too). */
  hostedEvents: string[]
  /** Their games, archived ones included, removed with their Tags. */
  games: number
  /** Their Messages that still had a text and lose it (those inside a hosted Event go with the Event). */
  messages: number
  /** Their Votes (those inside a hosted Event go with the Event). */
  votes: number
  /** Their Memberships of another Host's Event that has not finished: they end. */
  membershipsEnding: number
  /**
   * Their Memberships of another Host's finished Event: the Seat or the Stands stays. A Membership of a Deleted Event is in neither count (`UserDeletion.events`
   * lists no Deleted Event).
   */
  membershipsStaying: number
  /** The objects the deletion removes from the store: the Profile picture and every removed game's key that no game row names any more. */
  imageObjects: number
  /** With `apply`: the objects the store could not delete (orphans, no failure); null in a dry run, which opens no store. */
  imagesLeft: number | null
}

/** The functions of server/utils/delete-user.ts, handed in so a test can hand in a failing one. */
export interface Deletion {
  deleteUser: typeof deleteUser
  removeImages: typeof removeImages
  UserNotDeletable: typeof UserNotDeletable
}

const NOT_DELETABLE: Record<string, string> = {
  unknown_user: 'no User has this id.',
  already_deleted: 'this User is deleted already.',
  games_held: 'a game of this User is named by another Host\'s Event (ADR 0018 rules that out); nothing was changed.',
}

/**
 * Runs the deletion for one User as a rehearsal that is rolled back, or for real with `apply`. One code path for both: the whole of `deleteUser` runs inside an
 * outer transaction (a nested `db.transaction` is a savepoint), which is read, then either committed or thrown away, so a dry run also meets a refusal and its
 * numbers are the ones `apply` reports. With `apply` the store is touched after the commit only; a dry run takes none.
 * Throws `Stopped` for a User that is unknown, deleted already, or held by another Host's Event; any other error is the caller's (a failed connection).
 */
export async function deleteAccount({ db, userId, apply, now, deletion, store }: {
  db: Db
  userId: string
  apply: boolean
  now: Date
  deletion: Deletion
  /** The image store, needed with `apply`. */
  store?: ImageStore
}): Promise<Report> {
  if (apply && !store) throw new Error('apply needs an image store')
  let done: Awaited<ReturnType<Deletion['deleteUser']>> | undefined
  let counts: Pick<Report, 'games' | 'messages' | 'votes'> | undefined
  try {
    await db.transaction(async (tx) => {
      const one = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0
      counts = {
        games: await one(tx.select({ n: count() }).from(schema.games).where(eq(schema.games.createdBy, userId))),
        messages: await one(tx.select({ n: count() }).from(schema.messages).where(and(eq(schema.messages.writerId, userId), isNull(schema.messages.deletedAt)))),
        votes: await one(tx.select({ n: count() }).from(schema.pollVotes).where(eq(schema.pollVotes.userId, userId))),
      }
      done = await deletion.deleteUser(tx, userId, now)
      if (!apply) throw new DryRun()
    })
  }
  catch (error) {
    if (!(error instanceof DryRun)) {
      if (error instanceof deletion.UserNotDeletable) throw new Stopped(NOT_DELETABLE[error.reason] ?? 'this User cannot be deleted; nothing was changed.', error.reason)
      throw error
    }
  }
  if (!done || !counts) throw new Error('the deletion did not run')

  const report: Report = {
    hostedEvents: done.goneEvents,
    ...counts,
    membershipsEnding: done.events.filter(event => !event.finished).length,
    membershipsStaying: done.events.filter(event => event.finished).length,
    imageObjects: done.imageKeys.length,
    imagesLeft: null,
  }
  if (apply && store) report.imagesLeft = await removeObjects(deletion, store, done.imageKeys)
  return report
}

/**
 * Deletes the objects after the commit and counts the ones the store refuses. `removeImages` logs `console.error('Image cleanup failed', key, failure)`, and the key
 * holds a game id and a fetch failure can carry the account's host name: the store handed to it throws a bare error and the log is held back while it runs.
 * An object left is an orphan and costs nothing.
 */
async function removeObjects(deletion: Deletion, store: ImageStore, keys: string[]): Promise<number> {
  let left = 0
  const counting: ImageStore = {
    ...store,
    async delete(key) {
      try {
        await store.delete(key)
      }
      catch {
        left++
        throw new Error('R2 delete failed')
      }
    },
  }
  const log = console.error
  console.error = () => {}
  try {
    await deletion.removeImages(counting, keys)
  }
  finally {
    console.error = log
  }
  return left
}
