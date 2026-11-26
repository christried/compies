import { and, asc, count, eq, inArray, isNotNull, isNull, max, sql, type SQLWrapper } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { EventView } from '../../shared/event'
import { canSeeLibrary, type GamePrice, type GamePriceInput, type GameTag, type GameView, type HostGameFacts, type PoolGame, type PoolGameFace, type RoundGame } from '../../shared/game'
import type { AuthUser } from '../../shared/auth'
import { IMAGE_PATH } from '../../shared/image'
import { beforeFinish, PHASES } from '../../shared/phase'
import { eventPoolGames, events, games, rounds } from '../db/schema'
import { isUuid } from '../domain/uuid'
import type { Db } from './db'
import { apiError, apiNotFound } from './errors'
import { loadTags } from './game-tags'
import { getUser } from './user'

// Shared parts of the Game library routes (#141).

// The three terms every query about the library spells (#820, review 0.16 S3 = F1): whose a game is, whether it is Archived, and what a live Event is. Each has this one home, so a
// reader added later cannot forget one; a second hand-written copy of `games.createdBy`, `games.archivedAt` or the live-Event rule is a finding.

/** A game in the library of `hostId` (ADR 0018: the owner is the Host; another Host's copy is a different row). A column of an outer query works as `hostId` too, in a correlated subquery. */
export function ownedBy(hostId: string | SQLWrapper) {
  return eq(games.createdBy, hostId)
}

/** A game that is not Archived (#725): the games a wheel, a count, a draw and a Member's list are made of. */
export const notArchived = isNull(games.archivedAt)

/** A game that is Archived (#467). */
export const archivedGame = isNotNull(games.archivedAt)

/** The phases in which an Event is still live: it has not finished (`beforeFinish`). */
export const LIVE_PHASES = PHASES.filter(beforeFinish)

/** An Event of `hostId` that is not deleted, finished ones included (#900): the Host's Events a game was played in. */
export function hostedEventOf(hostId: string) {
  return and(eq(events.hostId, hostId), isNull(events.deletedAt))
}

/** An Event of `hostId` that is live: not deleted and not finished (#725, #733). The one sentence behind „who is told when a game is archived“ and „in how many Events a game sits“. */
export function liveEventOf(hostId: string) {
  return and(hostedEventOf(hostId), inArray(events.phase, LIVE_PHASES))
}

/** A Round that was played: it has a Result and was not put back (#656, #900). The one sentence behind „the plays on a game's page“ and „when a game was last played“. */
export const playedRound = and(isNotNull(rounds.resultAt), isNull(rounds.putBackAt))

/**
 * The games of an Event's Game pool, the Host's own only (`games.created_by = events.host_id`, #722: a pool row of another Host's game, which the 0.15 code could still write
 * while a migration ran, ADR 0007, is in no list), by name. `archived: 'any'` is the Host's list, which carries every pool game; 'no' leaves the Archived ones out, as every
 * Member surface does (#725). The one join behind `readPool` (the ids) and `eventPool` (the views).
 */
export async function poolGames(db: Db, eventId: string, hostId: string, archived: 'any' | 'no'): Promise<(typeof games.$inferSelect)[]> {
  const rows = await db
    .select({ game: games })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(and(eq(eventPoolGames.eventId, eventId), ownedBy(hostId), archived === 'no' ? notArchived : undefined))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  return rows.map(row => row.game)
}

/** The answer a missing route gets; the library gives it to everyone who may not see it, and for a game that is not the viewer's own (#455). */
export function libraryNotFound() {
  return apiNotFound()
}

/** The signed-in User who may see the library: a User with the Host permission. Everyone else gets libraryNotFound. */
export async function requireLibraryViewer(event: H3Event): Promise<AuthUser> {
  const user = await getUser(event)
  if (!user || !canSeeLibrary(user)) throw libraryNotFound()
  return user
}

/**
 * One game of `ownerId`'s library (#455, ADR 0018). libraryNotFound for text that is no uuid (it never reaches the
 * database), for an unknown id and for a game of another User: the three answer alike, the Platform admin's request included.
 */
export async function loadGame(db: Db, id: string, ownerId: string): Promise<typeof games.$inferSelect> {
  if (!isUuid(id)) throw libraryNotFound()
  const [row] = await db.select().from(games).where(and(eq(games.id, id), ownedBy(ownerId)))
  if (!row) throw libraryNotFound()
  return row
}

/** A games row as an Event's pool shows it to a Member (#224): picture, name, Price (#338), players and Suitabilities (#444). */
export function poolGameFace(row: typeof games.$inferSelect): PoolGameFace {
  return {
    id: row.id,
    name: row.name,
    // Served by GET /api/images/:key; a replaced image gets a new key, so its URL never serves stale (#143).
    imageUrl: row.imageKey ? `${IMAGE_PATH}${row.imageKey}` : null,
    youtubeId: row.youtubeId,
    price: priceOf(row),
    playersMin: row.playersMin,
    playersMax: row.playersMax,
    suitabilities: row.suitabilities,
  }
}

/** A games row as the Host's pool shows it (#146): the face plus the clip, the notes (#224) and the archive flag (#726), no creator and no edit rights. */
export function poolGameView(row: typeof games.$inferSelect): PoolGame {
  return {
    ...poolGameFace(row),
    clipStart: row.clipStart,
    clipLength: row.clipLength,
    notes: row.notes,
    archived: row.archivedAt !== null,
  }
}

/** A games row as an Event's Round shows its set game to every Member (#228): the Host's pool view without the notes and the archive flag (#726). */
export function roundGameView(row: typeof games.$inferSelect): RoundGame {
  const { notes: _notes, archived: _archived, ...game } = poolGameView(row)
  return game
}

/**
 * A games row as the library shows it: the pool view plus the Tags (#335), the archive flag (#467) and the Price (#337).
 * Private (#365): a route gets its views from `readGameViews`, so none can answer a game without its Tags.
 */
function gameView(row: typeof games.$inferSelect, tags: GameTag[]): GameView {
  return {
    ...poolGameView(row),
    tags,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * The library's views of `rows`, in their order (#365). The Tags of all the rows come from one query; a game without Tags
 * answers []. `db` may be a transaction, so a write answers the Tags it has just stored. No rows, no query.
 * The ids are bind parameters of one `inArray`, and Postgres takes at most about 65k of them per statement (#365).
 */
export async function readGameViews(db: Db, rows: (typeof games.$inferSelect)[]): Promise<GameView[]> {
  if (rows.length === 0) return []
  const tags = await loadTags(db, rows.map(row => row.id))
  return rows.map(row => gameView(row, tags.get(row.id) ?? []))
}

/** The row's Price as the library shows it (#337); null when none. */
export function priceOf(row: typeof games.$inferSelect): GamePrice | null {
  if (!row.priceSource || !row.priceCheckedAt) return null
  return { cents: row.priceCents, source: row.priceSource, checkedAt: row.priceCheckedAt.toISOString() }
}

/**
 * The price columns an input changes (#337). Absent price and no flag: {} (nothing written). The day moves when the stored cents or
 * source change, or when `priceChecked` is sent; an unchanged save keeps it. `price: null` clears all three. Throws
 * apiError('invalid_price') when `priceChecked` is sent and the game would have no Price after the save. `stored` is the game's row as
 * the route's transaction read it under its lock (#360), null on create. Thrown inside that transaction, the refusal writes nothing.
 */
export function priceColumns(
  input: { price: GamePriceInput | null | undefined, priceChecked: boolean },
  stored: typeof games.$inferSelect | null,
  now: Date,
): Partial<typeof games.$inferInsert> {
  const storedPrice = stored ? priceOf(stored) : null
  const resulting = input.price === undefined ? storedPrice : input.price
  if (input.priceChecked && resulting === null) throw apiError('invalid_price')
  if (input.price === null) return { priceCents: null, priceSource: null, priceCheckedAt: null }
  if (input.price === undefined) return input.priceChecked ? { priceCheckedAt: now } : {}
  const changed = !storedPrice || storedPrice.cents !== input.price.cents || storedPrice.source !== input.price.source
  if (!input.priceChecked && !changed) return {}
  return { priceCents: input.price.cents, priceSource: input.price.source, priceCheckedAt: now }
}

/**
 * The ids of the games the Host's read names as tiles (#443): the Game pool, the open Rounds' games and the latest spin's game, each once. Not the Veto
 * window's game, the Results' or the clip's: they are no tiles. Derived from the finished sections, so a game the read does not name is none of its ids.
 */
export function hostGameIds(view: Pick<EventView, 'pool' | 'rounds' | 'wheel'>): string[] {
  const ids = new Set<string>()
  for (const game of view.pool ?? []) ids.add(game.id)
  for (const round of view.rounds) ids.add(round.game.id)
  const drawn = view.wheel?.spin?.game
  if (drawn) ids.add(drawn.id)
  return [...ids]
}

/**
 * The Tags and the Game notes of `ids`, by game id, for the Host's game dialog (#443). A game without Tags gets `tags: []`, one without Notes `notes: null`; an id
 * that is no game is left out. No ids, no query. Two statements and no lock, like the read it joins.
 */
export async function readHostGameFacts(db: Db, ids: string[]): Promise<Record<string, HostGameFacts>> {
  if (ids.length === 0) return {}
  const [tags, rows] = await Promise.all([
    loadTags(db, ids),
    db.select({ id: games.id, notes: games.notes }).from(games).where(inArray(games.id, ids)),
  ])
  return Object.fromEntries(rows.map(row => [row.id, { tags: tags.get(row.id) ?? [], notes: row.notes }]))
}

/**
 * How many of the Host's live Events hold each game in their Game pool (#733, „in 2 Events“ on the library card). Live is an Event that has not
 * finished (`beforeFinish`) and is not deleted; the rule is the pool row alone, so a game a Round or a Draw set but the pool lost does not count, and an
 * archived game keeps its count (#725 leaves its pool rows). Only the Host's own Events (ADR 0018: a pool row of another Host's Event is a leftover of the
 * 0.15 code). One grouped statement, whatever the number of games. Only games with a count above 0 have a key.
 */
export async function liveEventCounts(db: Db, hostId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ gameId: eventPoolGames.gameId, n: count() })
    .from(eventPoolGames)
    .innerJoin(events, eq(events.id, eventPoolGames.eventId))
    .where(liveEventOf(hostId))
    .groupBy(eventPoolGames.gameId)
  return Object.fromEntries(rows.map(row => [row.gameId, Number(row.n)]))
}

/**
 * When each of the Host's games was last played (#900, „zuletzt am“ on the library card): the instant of the latest Result (`rounds.result_at`, a UTC ISO string) of a Round of any of the
 * Host's Events that are not deleted, finished ones included. A Correction (#275) keeps `resultAt`, so it does not move the date. The Round names the game, so a game set outside its
 * pool counts and an archived one too; the Host's own Events only (ADR 0018). One grouped statement, whatever the number of games. Only played games have a key.
 */
export async function lastPlayedAt(db: Db, hostId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ gameId: rounds.gameId, at: max(rounds.resultAt) })
    .from(rounds)
    .innerJoin(events, eq(events.id, rounds.eventId))
    .where(and(hostedEventOf(hostId), isNotNull(rounds.gameId), playedRound))
    .groupBy(rounds.gameId)
  return Object.fromEntries(rows.flatMap(row => row.gameId && row.at ? [[row.gameId, new Date(row.at).toISOString()]] : []))
}
