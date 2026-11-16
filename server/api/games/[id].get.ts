import { defineEventHandler, getRouterParam } from 'h3'
import { useDb } from '../../utils/db'
import { loadGame, readGameViews, requireLibraryViewer } from '../../utils/library'
import type { GameView } from '../../../shared/game'

// One game of the viewer's library (#141). An unknown id, text that is no uuid and a game of another User (#455) answer like
// a missing route; text that is no uuid never reaches the database.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const game = await loadGame(db, getRouterParam(event, 'id') ?? '', viewer.id)
  const [view] = await readGameViews(db, [game])
  return view!
})
