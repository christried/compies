import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { GameTag } from '../../shared/game'
import { gameTags } from '../db/schema'
import type { Db } from './db'

// Tag persistence (#335, #365): the Tags a game carries, and the Tags in use. Only the Game library reads and writes them.

/** The Tags of the games `gameIds` (all games without it), each game's in position order (#335). A game without Tags is not in the map. */
export async function loadTags(db: Db, gameIds?: string[]): Promise<Map<string, GameTag[]>> {
  const rows = await db
    .select({ gameId: gameTags.gameId, key: gameTags.key, label: gameTags.label })
    .from(gameTags)
    .where(gameIds ? inArray(gameTags.gameId, gameIds) : undefined)
    .orderBy(asc(gameTags.gameId), asc(gameTags.position))
  const byGame = new Map<string, GameTag[]>()
  for (const { gameId, key, label } of rows) {
    const tags = byGame.get(gameId) ?? []
    tags.push({ key, label })
    byGame.set(gameId, tags)
  }
  return byGame
}

/** The Tags in use (#335): every key some game carries, once, with the label of its earliest row, by key. Sorted here, so PGlite and Neon agree whatever the collation. */
export async function loadTagsInUse(db: Db): Promise<GameTag[]> {
  const rows = await db
    .select({ key: gameTags.key, label: gameTags.label })
    .from(gameTags)
    .orderBy(asc(gameTags.key), asc(gameTags.createdAt), asc(gameTags.gameId))
  const firstPerKey = new Map<string, GameTag>()
  for (const row of rows) if (!firstPerKey.has(row.key)) firstPerKey.set(row.key, row)
  return [...firstPerKey.values()].sort((a, b) => a.key.localeCompare(b.key, 'de'))
}

/**
 * Stores the game's Tags (#335), inside the route's transaction. A Tag another game already carries takes the label of
 * its earliest row, so the first spelling is kept; a Tag the game already had keeps its own label and only moves. The
 * game's other rows go, so an empty list clears them all.
 */
export async function saveTags(tx: Db, gameId: string, tags: GameTag[]): Promise<void> {
  const keys = tags.map(tag => tag.key)
  const labelInUse = new Map<string, string>()
  if (keys.length > 0) {
    const used = await tx
      .select({ key: gameTags.key, label: gameTags.label })
      .from(gameTags)
      .where(inArray(gameTags.key, keys))
      .orderBy(asc(gameTags.createdAt), asc(gameTags.gameId))
    for (const row of used) if (!labelInUse.has(row.key)) labelInUse.set(row.key, row.label)
  }

  await tx.delete(gameTags).where(and(eq(gameTags.gameId, gameId), keys.length > 0 ? notInArray(gameTags.key, keys) : undefined))

  if (tags.length === 0) return
  await tx
    .insert(gameTags)
    .values(tags.map((tag, position) => ({ gameId, key: tag.key, label: labelInUse.get(tag.key) ?? tag.label, position })))
    .onConflictDoUpdate({ target: [gameTags.gameId, gameTags.key], set: { position: sql`excluded.position` } })
}
