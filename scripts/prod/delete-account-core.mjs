// What scripts/prod/delete-account.mjs does, given a database: the counts, the deletion of server/utils/delete-user.ts in one transaction, and the images.
// No connection of its own, no process.exit, no console output (the command prints), so test/integration/delete-account-script.test.ts drives it on PGlite
// with the real module. It never holds a name, an address or a Message's text: counts and Event ids are all it reads out.
import { and, count, eq, isNull } from 'drizzle-orm'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A reason the deletion does not run, in a line the command prints as it is: it names no User, no URL and no driver message. */
export class Stopped extends Error {
  /**
   * @param {string} message
   * @param {string} [reason] the module's reason (`UserNotDeletable.reason`), for the Admin page's route (#941), which answers by it; the command prints the message only
   */
  constructor(message, reason) {
    super(message)
    this.reason = reason
  }
}

/** Thrown at the end of a dry run, so the transaction that holds the whole deletion rolls back. It never leaves `deleteAccount`. */
class DryRun extends Error {}

/**
 * What the deletion removes or ends, all counts and Event ids.
 * @typedef {object} Report
 * @property {string[]} hostedEvents the Events the User hosted, removed with everything on them (Deleted ones too)
 * @property {number} games their games, archived ones included, removed with their Tags
 * @property {number} messages their Messages that still had a text and lose it (those inside a hosted Event go with the Event)
 * @property {number} votes their Votes (those inside a hosted Event go with the Event)
 * @property {number} membershipsEnding their Memberships of another Host's Event that has not finished: they end
 * @property {number} membershipsStaying their Memberships of another Host's finished Event: the Seat or the Stands stays. A Membership of a Deleted Event is in neither count (`UserDeletion.events` lists no Deleted Event).
 * @property {number} imageObjects the objects the deletion removes from the store: the Profile picture and every removed game's key that no game row names any more
 * @property {number | null} imagesLeft with `apply`: the objects the store could not delete (orphans, no failure); null in a dry run, which opens no store
 */

/**
 * @typedef {object} Deletion the functions of server/utils/delete-user.ts, handed in because this file does not load TypeScript
 * @property {(db: any, userId: string, now: Date) => Promise<{ imageKeys: string[], events: { finished: boolean }[], goneEvents: string[] }>} deleteUser
 * @property {(store: any, keys: readonly string[]) => Promise<void>} removeImages
 * @property {new (...args: any[]) => Error & { reason: string }} UserNotDeletable
 */

const NOT_DELETABLE = {
  unknown_user: 'no User has this id.',
  already_deleted: 'this User is deleted already.',
  games_held: 'a game of this User is named by another Host\'s Event (ADR 0018 rules that out); nothing was changed.',
}

/**
 * Runs the deletion for one User as a rehearsal that is rolled back, or for real with `apply`. One code path for both: the whole of `deleteUser` runs inside an
 * outer transaction (a nested `db.transaction` is a savepoint), which is read, then either committed or thrown away, so a dry run also meets a refusal and its
 * numbers are the ones `apply` prints. With `apply` the store is touched after the commit only; a dry run takes none.
 * Throws `Stopped` for a User that is unknown, deleted already, or held by another Host's Event; any other error is the caller's (a failed connection).
 * @param {object} input
 * @param {any} input.db a drizzle database
 * @param {any} input.schema `server/db/schema.ts`
 * @param {string} input.userId
 * @param {boolean} input.apply
 * @param {Date} input.now
 * @param {Deletion} input.deletion
 * @param {any} [input.store] the image store, needed with `apply`
 * @returns {Promise<Report>}
 */
export async function deleteAccount({ db, schema, userId, apply, now, deletion, store }) {
  if (apply && !store) throw new Error('apply needs an image store')
  /** @type {Awaited<ReturnType<Deletion['deleteUser']>> | undefined} */
  let done
  /** @type {Pick<Report, 'games' | 'messages' | 'votes'> | undefined} */
  let counts
  try {
    await db.transaction(async (tx) => {
      const one = async (/** @type {Promise<{ n: number }[]>} */ query) => (await query)[0]?.n ?? 0
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
      if (error instanceof deletion.UserNotDeletable) throw new Stopped(NOT_DELETABLE[/** @type {keyof typeof NOT_DELETABLE} */ (error.reason)] ?? 'this User cannot be deleted; nothing was changed.', error.reason)
      throw error
    }
  }
  if (!done || !counts) throw new Error('the deletion did not run')

  const report = {
    hostedEvents: done.goneEvents,
    ...counts,
    membershipsEnding: done.events.filter(event => !event.finished).length,
    membershipsStaying: done.events.filter(event => event.finished).length,
    imageObjects: done.imageKeys.length,
    imagesLeft: /** @type {number | null} */ (null),
  }
  if (apply) report.imagesLeft = await removeObjects(deletion, store, done.imageKeys)
  return report
}

/**
 * Deletes the objects after the commit and counts the ones the store refuses. `removeImages` logs `console.error('Image cleanup failed', key, failure)`, and the key
 * holds a game id and a fetch failure can carry the account's host name: the store handed to it throws a bare error and the log is held back while it runs.
 * An object left is an orphan and costs nothing.
 * @param {Deletion} deletion
 * @param {any} store
 * @param {string[]} keys
 */
async function removeObjects(deletion, store, keys) {
  let left = 0
  const counting = {
    ...store,
    async delete(/** @type {string} */ key) {
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

/**
 * The lines the command prints under its first one (the database), in the tense of the mode. Counts and Event ids only; the last line says that no room was told.
 * @param {Report} report
 * @param {{ apply: boolean }} mode
 * @returns {string[]}
 */
export function reportLines(report, { apply }) {
  const hosted = report.hostedEvents.length > 0 ? ` (${report.hostedEvents.join(', ')})` : ''
  const objects = apply && report.imagesLeft !== null
    ? `Image objects removed: ${report.imageObjects - report.imagesLeft}${report.imagesLeft > 0 ? ` of ${report.imageObjects}` : ''}`
    : `Image objects that ${apply ? 'are' : 'would be'} removed: ${report.imageObjects}`
  return [
    `Events hosted, ${apply ? 'removed' : 'to be removed'} with everything on them: ${report.hostedEvents.length}${hosted}`,
    `Games ${apply ? 'removed' : 'to be removed'} with their Tags: ${report.games}`,
    `Messages that ${apply ? 'lost' : 'would lose'} their text: ${report.messages}`,
    `Votes ${apply ? 'removed' : 'to be removed'}: ${report.votes}`,
    `Memberships that ${apply ? 'ended' : 'would end'}: ${report.membershipsEnding}`,
    `Memberships that stay (finished Events): ${report.membershipsStaying}`,
    objects,
    ...(apply ? [] : ['Dry run: nothing is deleted. Add --apply to delete.']),
    'No room is told: nobody is told live, every open page finds out at its next read.',
  ]
}
