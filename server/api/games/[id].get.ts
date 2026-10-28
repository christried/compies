import { defineEventHandler, getRouterParam } from 'h3'
import { useDb } from '../../utils/db'
import { gameView, loadGame, requireLibraryViewer } from '../../utils/library'
import type { GameView } from '../../../shared/game'

// One game of the library (#141). An unknown id and text that is no uuid answer like a missing route;
// text that is no uuid never reaches the database.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const { game, creatorName } = await loadGame(useDb(event), getRouterParam(event, 'id') ?? '')
  return gameView(game, creatorName, viewer)
})
