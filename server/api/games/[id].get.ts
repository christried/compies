import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam } from 'h3'
import { games, users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { gameView, libraryNotFound, requireLibraryViewer } from '../../utils/library'
import type { GameView } from '../../../shared/game'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One game of the library (#141). An unknown id and text that is no uuid answer like a missing route;
// text that is no uuid never reaches the database.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID.test(id)) throw libraryNotFound()

  const [row] = await useDb(event)
    .select({ game: games, creatorName: users.name, creatorDisplayName: users.displayName })
    .from(games)
    .innerJoin(users, eq(games.createdBy, users.id))
    .where(eq(games.id, id))
  if (!row) throw libraryNotFound()

  return gameView(row.game, row.creatorDisplayName ?? row.creatorName, viewer)
})
