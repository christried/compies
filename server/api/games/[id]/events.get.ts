import { defineEventHandler, getRouterParam } from 'h3'
import { useDb } from '../../../utils/db'
import { readGameEvents } from '../../../utils/game-events'
import { loadGame, requireLibraryViewer } from '../../../utils/library'
import type { GameEvents } from '../../../../shared/game-events'

// The Events of one game of the viewer's library (#656): those the viewer hosts that hold the game in their pool or played it. The game is
// looked up first, so a game that is not the viewer's own, an unknown id and text that is no uuid answer like a missing route (#455).
export default defineEventHandler(async (event): Promise<GameEvents> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const game = await loadGame(db, getRouterParam(event, 'id') ?? '', viewer.id)
  return await readGameEvents(db, game)
})
