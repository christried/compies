import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { games, users } from '../../db/schema'
import { parseGameInput } from '../../domain/game'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { gameView, libraryNotFound, requireLibraryViewer } from '../../utils/library'
import { canEditGame, type GameView } from '../../../shared/game'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Edits a game of the library (#142). The body is the whole game, as the form sends it. Only the creator and
// the Platform admin may edit; another Host gets not_game_editor, and a Member or an unknown game the
// answer of a missing route. The image and the creator stay as they are.
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
  if (!canEditGame(viewer, row.game)) throw apiError('not_game_editor')

  const parsed = parseGameInput(await readBody(event))
  if (!parsed.ok) throw apiError(parsed.error)

  const [updated] = await useDb(event)
    .update(games)
    .set(parsed.game)
    .where(eq(games.id, id))
    .returning()
  return gameView(updated!, row.creatorDisplayName ?? row.creatorName, viewer)
})
