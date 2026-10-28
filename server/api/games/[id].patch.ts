import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { games } from '../../db/schema'
import { parseGameInput } from '../../domain/game'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { gameView, loadGame, requireLibraryViewer } from '../../utils/library'
import { canEditGame, type GameView } from '../../../shared/game'

// Edits a game of the library (#142). The body is the whole game, as the form sends it. Only the creator and
// the Platform admin may edit; another Host gets not_game_editor, and a Member or an unknown game the
// answer of a missing route. The image and the creator stay as they are.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const { game, creatorName } = await loadGame(db, getRouterParam(event, 'id') ?? '')
  if (!canEditGame(viewer, game)) throw apiError('not_game_editor')

  const parsed = parseGameInput(await readBody(event))
  if (!parsed.ok) throw apiError(parsed.error)

  const [updated] = await db
    .update(games)
    .set(parsed.game)
    .where(eq(games.id, game.id))
    .returning()
  return gameView(updated!, creatorName, viewer)
})
