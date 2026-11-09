import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { canEditGame, canSeeLibrary, type GamePrice, type GamePriceInput, type GameTag, type GameView, type PoolGame, type PoolGameFace, type RoundGame } from '../../shared/game'
import { shownName, type AuthUser } from '../../shared/auth'
import { games, users } from '../db/schema'
import { isUuid } from '../domain/uuid'
import type { Db } from './db'
import { apiError, apiNotFound } from './errors'
import { loadTags } from './game-tags'
import { getUser } from './user'

// Shared parts of the Game library routes (#141).

/** The answer a missing route gets; the library gives it to everyone who may not see it (spec #138). */
export function libraryNotFound() {
  return apiNotFound()
}

/** The signed-in User who may see the library: a Host or the Platform admin. Everyone else gets libraryNotFound. */
export async function requireLibraryViewer(event: H3Event): Promise<AuthUser> {
  const user = await getUser(event)
  if (!user || !canSeeLibrary(user)) throw libraryNotFound()
  return user
}

/** A games row with its creator's names: the one select shape the library routes share. */
export const gameWithCreator = { game: games, creatorName: users.name, creatorDisplayName: users.displayName }

/** The creator's name as the library shows it: the display name when they set one. */
export function creatorNameOf({ creatorName, creatorDisplayName }: { creatorName: string, creatorDisplayName: string | null | undefined }): string {
  return shownName({ name: creatorName, displayName: creatorDisplayName })
}

/** One game with its creator's name; libraryNotFound for text that is no uuid (it never reaches the database) and for an unknown id. */
export async function loadGame(db: Db, id: string): Promise<{ game: typeof games.$inferSelect, creatorName: string }> {
  if (!isUuid(id)) throw libraryNotFound()
  const [row] = await db
    .select(gameWithCreator)
    .from(games)
    .innerJoin(users, eq(games.createdBy, users.id))
    .where(eq(games.id, id))
  if (!row) throw libraryNotFound()
  return { game: row.game, creatorName: creatorNameOf(row) }
}

/** A games row as an Event's pool shows it to a Member (#224): picture, name and Price (#338). */
export function poolGameFace(row: typeof games.$inferSelect): PoolGameFace {
  return {
    id: row.id,
    name: row.name,
    // Served by GET /api/images/:key; a replaced image gets a new key, so its URL never serves stale (#143).
    imageUrl: row.imageKey ? `/api/images/${row.imageKey}` : null,
    youtubeId: row.youtubeId,
    price: priceOf(row),
  }
}

/** A games row as the Host's pool shows it (#146): the face plus what GameCard shows and the notes (#224), no creator and no edit rights. */
export function poolGameView(row: typeof games.$inferSelect): PoolGame {
  return {
    ...poolGameFace(row),
    clipStart: row.clipStart,
    clipLength: row.clipLength,
    playersMin: row.playersMin,
    playersMax: row.playersMax,
    suitabilities: row.suitabilities,
    notes: row.notes,
  }
}

/** A games row as an Event's Round shows its set game to every Member (#228): the Host's pool view without the notes. */
export function roundGameView(row: typeof games.$inferSelect): RoundGame {
  const { notes: _notes, ...game } = poolGameView(row)
  return game
}

/**
 * A games row as the library shows it to `viewer`: the pool view plus creator, edit rights, the Tags (#335) and the Price (#337).
 * Private (#365): a route gets its views from `readGameViews`, so none can answer a game without its Tags.
 */
function gameView(row: typeof games.$inferSelect, creatorName: string, viewer: AuthUser, tags: GameTag[]): GameView {
  return {
    ...poolGameView(row),
    tags,
    createdBy: { id: row.createdBy, name: creatorName },
    createdAt: row.createdAt.toISOString(),
    canEdit: canEditGame(viewer, row),
  }
}

/**
 * The library's views of `rows`, in their order (#365). The Tags of all the rows come from one query; a game without Tags
 * answers []. `db` may be a transaction, so a write answers the Tags it has just stored. No rows, no query.
 * The ids are bind parameters of one `inArray`, and Postgres takes at most about 65k of them per statement (#365).
 */
export async function readGameViews(db: Db, rows: { game: typeof games.$inferSelect, creatorName: string }[], viewer: AuthUser): Promise<GameView[]> {
  if (rows.length === 0) return []
  const tags = await loadTags(db, rows.map(row => row.game.id))
  return rows.map(row => gameView(row.game, row.creatorName, viewer, tags.get(row.game.id) ?? []))
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
