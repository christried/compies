import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { canEditGame, canSeeLibrary, type GameView, type PoolGame, type PoolGameFace, type RoundGame } from '../../shared/game'
import { shownName, type AuthUser } from '../../shared/auth'
import { games, users } from '../db/schema'
import { isUuid } from '../domain/uuid'
import type { Db } from './db'
import { apiNotFound } from './errors'
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

/** A games row as an Event's pool shows it to a Member (#224): picture and name only. */
export function poolGameFace(row: typeof games.$inferSelect): PoolGameFace {
  return {
    id: row.id,
    name: row.name,
    // Served by GET /api/images/:key; a replaced image gets a new key, so its URL never serves stale (#143).
    imageUrl: row.imageKey ? `/api/images/${row.imageKey}` : null,
    youtubeId: row.youtubeId,
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

/** A games row as the library shows it to `viewer`: the pool view plus creator and edit rights. */
export function gameView(row: typeof games.$inferSelect, creatorName: string, viewer: AuthUser): GameView {
  return {
    ...poolGameView(row),
    createdBy: { id: row.createdBy, name: creatorName },
    createdAt: row.createdAt.toISOString(),
    canEdit: canEditGame(viewer, row),
  }
}
