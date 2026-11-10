import { and, desc, eq, inArray, lte, notInArray, or, sql } from 'drizzle-orm'
import { activity, draws, games, rounds, users } from '../db/schema'
import { shownName } from '../../shared/auth'
import { INSTANT_ACTIVITY_TYPES, activityGames, activityPeople, type ActivityEntry, type ActivityPage, type ActivityParams, type ActivityType, type InstantActivityType } from '../../shared/activity'
import type { RoomMessage } from '../../shared/realtime'
import type { Db } from './db'
import { stoppedDraws } from './draw-timeline'
import { apiError } from './errors'

// The Activity feed (#159, GLOSSARY: Activity feed). One home: every entry is written by recordActivity and every
// entry leaves the server through activityEntries, so the API and the room send the same shape.

type ActivityRow = typeof activity.$inferSelect

/**
 * What an entry's moment is, by its type (review 0.7, F16). An instant type (INSTANT_ACTIVITY_TYPES) takes the `at` it may be
 * read from and is not published; any other type is published at once and takes the request's clock (`now`), which decides
 * the games its message may name. The other one is refused by the compiler.
 */
type ActivityMoment<T extends ActivityType> = T extends InstantActivityType ? { at: Date, now?: never } : { at?: never, now: Date }

/**
 * The moment of an entry that has no instant of its own (review 0.8, S1, F7). A Session's start and end are the request's `now` (#259)
 * and the feed's groups compare an entry with them, so an entry is on that clock and on no other: the database's clock takes no part, or
 * an entry written less than its lead before the end of a Session would be stamped after it and land under „Nach der Session“, and one
 * written while it lags would land before the start it records. `clock_timestamp()` is the moment of the insert and `now()` the start
 * of the transaction, so their difference is the time the change has taken so far: `now` plus it grows with every insert of one change
 * and keeps their order.
 * The second term keeps the order of two changes whose `now` stands still or comes from two instances with different clocks (a test clock
 * does; a time elapsed inside a heavy request would otherwise outrun the next, light one): an entry is later than the Event's last one,
 * the entries that wait for their instant (INSTANT_ACTIVITY_TYPES) aside, whose `at` lies in the future.
 */
function stampOf(eventId: string, now: Date) {
  const instants = sql.join(INSTANT_ACTIVITY_TYPES.map(type => sql`${type}`), sql`, `)
  return sql`greatest(
    ${now.toISOString()}::timestamptz + (clock_timestamp() - now()),
    (select max(earlier.at) + interval '1 microsecond' from activity earlier where earlier.event_id = ${eventId} and earlier.type not in (${instants}))
  )`
}

/**
 * Writes one entry in the caller's transaction and queues `activity.added` for after the commit (changeEvent's
 * `publish`), so a change that throws leaves neither the entry nor the message. The entry is never earlier than its request's `now`
 * (stampOf), and two entries of one change keep the order they were written in.
 * An entry with an `at` of its own (#229: a draw's, for its stop instant) is written with it and not published: it would
 * reach everyone before the instant, so the clients refetch the feed when the instant passes (INSTANT_ACTIVITY_TYPES).
 */
export async function recordActivity<T extends ActivityType>(
  tx: Db,
  publish: (...messages: RoomMessage[]) => void,
  eventId: string,
  { type, actorId, params, at, now }: { type: T, actorId: string | null, params: ActivityParams[T] } & ActivityMoment<T>,
): Promise<void> {
  const [row] = await tx
    .insert(activity)
    .values({ eventId, type, actorId, params, at: at ?? stampOf(eventId, now!) })
    .returning()
  if (at) return
  // The change that wrote the entry has just set or put back its game: a settled Round names it, whatever the clock says.
  const [entry] = await activityEntries(tx, [row!], now!)
  publish({ type: 'activity.added', entry: entry! })
}

/** The User ids a row's params name, whose names the client needs (`people`): what its type declares in ACTIVITY_NAMES (#226, #273). */
function paramUserIds({ type, params }: ActivityRow): string[] {
  return activityPeople(type, params)
}

/**
 * The params an entry may show (#355): a Veto names its Party, never the Player who cast it. The cut runs on every `vetoes_revealed`
 * row, not only on rows written before #355: the previous deployment serves until the switch-over and still writes `userId` into
 * the entries it settles meanwhile. Any other type goes out as stored.
 */
function publicParams(row: ActivityRow): ActivityRow['params'] {
  if (row.type !== 'vetoes_revealed') return row.params
  const params = row.params as ActivityParams['vetoes_revealed']
  return { ...params, vetoes: params.vetoes.map(({ team }) => ({ team })) }
}

/**
 * The names of the games these rows name (ACTIVITY_NAMES) that may be named yet (#228, #229), keyed by Event and game: a game a
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
    .where(and(inArray(draws.gameId, gameIds), stoppedDraws(eventIds, now)))
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
    params: publicParams(row),
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
  // `lte` is the timeline's stop edge, inclusive: a `game_drawn` entry's `at` is its draw's stopAt, so it shows from the stop on, as
  // `drawGameKnown` and `stoppedDraws` say (shared/draw-timeline.ts); pinned against them in test/integration/draw-timeline.test.ts (#413).
  const rows = await db
    .select()
    .from(activity)
    .where(and(eq(activity.eventId, eventId), older,or(notInArray(activity.type, [...INSTANT_ACTIVITY_TYPES]), lte(activity.at, now))))
    .orderBy(desc(activity.at), desc(activity.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  return { entries: await activityEntries(db, page, now), next: rows.length > limit ? page[page.length - 1]!.id : null }
}
