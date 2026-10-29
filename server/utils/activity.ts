import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { activity, users } from '../db/schema'
import { shownName } from '../../shared/auth'
import type { ActivityEntry, ActivityPage, ActivityParams, ActivityType } from '../../shared/activity'
import type { RoomMessage } from '../../shared/realtime'
import type { Db } from './db'
import { apiError } from './errors'

// The Activity feed (#159, GLOSSARY: Activity feed). One home: every entry is written by recordActivity and every
// entry leaves the server through activityEntries, so the API and the room send the same shape.

type ActivityRow = typeof activity.$inferSelect

/**
 * Writes one entry in the caller's transaction and queues `activity.added` for after the commit (changeEvent's
 * `publish`), so a change that throws leaves neither the entry nor the message. `at` is the moment of the insert,
 * not of the transaction, so two entries of one change keep the order they were written in.
 */
export async function recordActivity<T extends ActivityType>(
  tx: Db,
  publish: (...messages: RoomMessage[]) => void,
  eventId: string,
  { type, actorId, params }: { type: T, actorId: string | null, params: ActivityParams[T] },
): Promise<void> {
  const [row] = await tx
    .insert(activity)
    .values({ eventId, type, actorId, params, at: sql`clock_timestamp()` })
    .returning()
  const [entry] = await activityEntries(tx, [row!])
  publish({ type: 'activity.added', entry: entry! })
}

/** The User ids a row's params name, whose names the client needs (`people`). */
function paramUserIds(params: ActivityRow['params']): string[] {
  const id = (params as { userId?: unknown }).userId
  return typeof id === 'string' ? [id] : []
}

/** The entries for these rows, in the same order, with the shown name of every actor and every User in the params. */
export async function activityEntries(db: Db, rows: ActivityRow[]): Promise<ActivityEntry[]> {
  const ids = [...new Set(rows.flatMap(row => [...(row.actorId ? [row.actorId] : []), ...paramUserIds(row.params)]))]
  const people = new Map<string, string>()
  if (ids.length > 0) {
    const found = await db.select({ id: users.id, name: users.name, displayName: users.displayName }).from(users).where(inArray(users.id, ids))
    for (const user of found) people.set(user.id, shownName(user))
  }
  // The row holds a type and params that were written together (recordActivity types them per type), but the table
  // only knows the unions apart, so the pairing is asserted here, once.
  return rows.map(row => ({
    id: row.id,
    at: row.at.toISOString(),
    actor: row.actorId ? { id: row.actorId, name: people.get(row.actorId) ?? '' } : null,
    people: Object.fromEntries(paramUserIds(row.params).map(id => [id, people.get(id) ?? ''])),
    type: row.type,
    params: row.params,
  }) as ActivityEntry)
}

/**
 * One page of an Event's feed, newest first (keyset by `(at, id)`). `before` is the id of the oldest entry the
 * caller already has; the page holds the entries older than it. `next` is that cursor for the page after this one,
 * null when this page reaches the oldest entry. A `before` that is no entry of this Event is a 400.
 */
export async function readActivityPage(db: Db, eventId: string, before: string | undefined, limit: number): Promise<ActivityPage> {
  if (before !== undefined) {
    const [known] = await db.select({ id: activity.id }).from(activity).where(and(eq(activity.id, before), eq(activity.eventId, eventId)))
    if (!known) throw apiError('invalid_cursor')
  }
  // The comparison runs on the stored values: a JS Date would cut the microseconds `at` has.
  const older = before === undefined ? undefined : sql`(${activity.at}, ${activity.id}) < (select c.at, c.id from activity c where c.id = ${before})`
  const rows = await db
    .select()
    .from(activity)
    .where(and(eq(activity.eventId, eventId), older))
    .orderBy(desc(activity.at), desc(activity.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  return { entries: await activityEntries(db, page), next: rows.length > limit ? page[page.length - 1]!.id : null }
}
