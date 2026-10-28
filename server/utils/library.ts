import { createError, type H3Event } from 'h3'
import { canEditGame, canSeeLibrary, type GameView } from '../../shared/game'
import type { AuthUser } from '../../shared/auth'
import type { games } from '../db/schema'
import { getUser } from './user'

// Shared parts of the Game library routes (#141).

/** The answer a missing route gets; the library gives it to everyone who may not see it (spec #138). */
export function libraryNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Not Found' })
}

/** The signed-in User who may see the library: a Host or the Platform admin. Everyone else gets libraryNotFound. */
export async function requireLibraryViewer(event: H3Event): Promise<AuthUser> {
  const user = await getUser(event)
  if (!user || !canSeeLibrary(user)) throw libraryNotFound()
  return user
}

/** A games row as the library shows it to `viewer`. */
export function gameView(row: typeof games.$inferSelect, creatorName: string, viewer: AuthUser): GameView {
  return {
    id: row.id,
    name: row.name,
    // #143: the URL of the uploaded image (row.imageKey) once the image store exists.
    imageUrl: null,
    youtubeId: row.youtubeId,
    clipStart: row.clipStart,
    clipLength: row.clipLength,
    playersMin: row.playersMin,
    playersMax: row.playersMax,
    formats: row.formats,
    createdBy: { id: row.createdBy, name: creatorName },
    createdAt: row.createdAt.toISOString(),
    canEdit: canEditGame(viewer, row),
  }
}
