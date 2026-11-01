import { and, desc, eq, inArray, lte, notInArray, or, sql } from 'drizzle-orm'
import { activity, draws, games, rounds, users } from '../db/schema'
import { shownName } from '../../shared/auth'
import { INSTANT_ACTIVITY_TYPES, activityGames, activityPeople, type ActivityEntry, type ActivityPage, type ActivityParams, type ActivityType } from '../../shared/activity'
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
 * An entry with an `at` of its own (#229: a draw's, for its stop instant) is written with it and not published: it would
 * reach everyone before the instant, so the clients refetch the feed when the instant passes (INSTANT_ACTIVITY_TYPES).
 */
export async function recordActivity<T extends ActivityType>(
  tx: Db,
  publish: (...messages: RoomMessage[]) => void,
  eventId: string,
  { type, actorId, params, at }: { type: T, actorId: string | null, params: ActivityParams[T], at?: Date },
): Promise<void> {
  const [row] = await tx
    .insert(activity)
    .values({ eventId, type, actorId, params, at: at ?? sql`clock_timestamp()` })
    .returning()
  if (at) return
  // The change that wrote the entry has just set or put back its game: a settled Round names it, whatever the clock says.
  const [entry] = await activityEntries(tx, [row!], new Date())
  publish({ type: 'activity.added', entry: entry! })
}

/** The User ids a row's params name, whose names the client needs (`people`): what its type declares in ACTIVITY_PEOPLE (#226). */
function paramUserIds({ type, params }: ActivityRow): string[] {
  return activityPeople(type, params)
}

/**
 * The names of the games these rows name (ACTIVITY_GAMES) that may be named yet (#228, #229), keyed by Event and game: a game a
 * draw of the Event has, from the draw's stop instant on (a set draw stops at its commit, so a set game is named at once; a
 * put-back Round's game too: everyone saw it set), or a game a Round of the Event has set (that Round settled at or after the
 * stop). Nothing else is named, so a Hidden wheel stays hidden in the feed (spec stories 69, 71, 80).
 */
async function namedGames(db: Db, rows: ActivityRow[], now: Date): Promise<Map<string, string>> {
  const gameIds = [...new Set(rows.flatMap(row => activityGames(row.type, row.params)))]
  const named = new Map<string, string>()
  if (gameIds.length === 0) return named
  const eventIds = [...new Set(rows.map(row => row.eventId))]
  const stopped = await db
    .select({ eventId: rounds.eventId, gameId: games.id, name: games.name })
    .from(draws)
    .innerJoin(rounds, eq(draws.roundId, rounds.id))
    .innerJoin(games, eq(draws.gameId, games.id))
    .where(and(inArray(draws.gameId, gameIds), inArray(rounds.eventId, eventIds), lte(draws.stopAt, now)))
  const set = await db
    .select({ eventId: rounds.eventId, gameId: games.id, name: games.name })
    .from(rounds)
    .innerJoin(games, eq(rounds.gameId, games.id))
    .where(and(inArray(rounds.gameId, gameIds), inArray(rounds.eventId, eventIds)))
  for (const { eventId, gameId, name } of [...stopped, ...set]) named.set(`${eventId}:${gameId}`, name)
  return named
}

/** The entries for these rows, in the same order, with the shown name of every actor and every User in the params, and the name of every game that may be named at `now`. */
export async function activityEntries(db: Db, rows: ActivityRow[], now: Date): Promise<ActivityEntry[]> {
  const named = await namedGames(db, rows, now)
  const ids = [...new Set(rows.flatMap(row => [...(row.actorId ? [row.actorId] : []), ...paramUserIds(row)]))]
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
    people: Object.fromEntries(paramUserIds(row).map(id => [id, people.get(id) ?? ''])),
    games: Object.fromEntries(activityGames(row.type, row.params).flatMap((id) => {
      const name = named.get(`${row.eventId}:${id}`)
      return name === undefined ? [] : [[id, name]]
    })),
    type: row.type,
    params: row.params,
  }) as ActivityEntry)
}

/**
 * One page of an Event's feed, newest first (keyset by `(at, id)`). `before` is the id of the oldest entry the
 * caller already has; the page holds the entries older than it. `next` is that cursor for the page after this one,
 * null when this page reaches the oldest entry. A `before` that is no entry of this Event is a 400. The entries of the types
 * that wait for their instant (INSTANT_ACTIVITY_TYPES) are left out until `now` has reached their `at` (#229).
 */
export async function readActivityPage(db: Db, eventId: string, before: string | undefined, limit: number, now: Date): Promise<ActivityPage> {
  if (before !== undefined) {
    const [known] = await db.select({ id: activity.id }).from(activity).where(and(eq(activity.id, before), eq(activity.eventId, eventId)))
    if (!known) throw apiError('invalid_cursor')
  }
  // The comparison runs on the stored values: a JS Date would cut the microseconds `at` has.
  const older = before === undefined ? undefined : sql`(${activity.at}, ${activity.id}) < (select c.at, c.id from activity c where c.id = ${before})`
  const rows = await db
    .select()
    .from(activity)
    .where(and(eq(activity.eventId, eventId), older, or(notInArray(activity.type, [...INSTANT_ACTIVITY_TYPES]), lte(activity.at, now))))
    .orderBy(desc(activity.at), desc(activity.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  return { entries: await activityEntries(db, page, now), next: rows.length > limit ? page[page.length - 1]!.id : null }
}
