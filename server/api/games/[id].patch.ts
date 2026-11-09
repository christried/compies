import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { games } from '../../db/schema'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { gameView, loadGame, loadTags, requireLibraryViewer, saveTags } from '../../utils/library'
import { canEditGame, parseGameInput, type GameView } from '../../../shared/game'

// Edits a game of the library (#142). The body is the whole game, as the form sends it. Only the creator and
// the Platform admin may edit; another Host gets not_game_editor, and a Member or an unknown game the
// answer of a missing route. The image and the creator stay as they are. A body without `tags` keeps the game's Tags
// (a 0.9 tab never sends them, #335); a list, even an empty one, replaces them.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const { game, creatorName } = await loadGame(db, getRouterParam(event, 'id') ?? '')
  if (!canEditGame(viewer, game)) throw apiError('not_game_editor')

  const parsed = parseGameInput(await readBody(event))
  if (!parsed.ok) throw apiError(parsed.error)

  const { tags, ...columns } = parsed.game
  const { updated, stored } = await db.transaction(async (tx) => {
    const [row] = await tx.update(games).set(columns).where(eq(games.id, game.id)).returning()
    if (tags !== undefined) await saveTags(tx, game.id, tags)
    return { updated: row!, stored: await loadTags(tx, [game.id]) }
  })
  return gameView(updated, creatorName, viewer, stored.get(game.id) ?? [])
})
