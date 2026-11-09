import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { games } from '../../db/schema'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { saveTags } from '../../utils/game-tags'
import { loadGame, priceColumns, readGameViews, requireLibraryViewer } from '../../utils/library'
import { useClock } from '../../utils/clock'
import { canEditGame, parseGameInput, type GameView } from '../../../shared/game'

// Edits a game of the library (#142). The body is the whole game, as the form sends it. Only the creator and
// the Platform admin may edit; another Host gets not_game_editor, and a Member or an unknown game the
// answer of a missing route. The image and the creator stay as they are. A body without `tags` keeps the game's Tags
// (a 0.9 tab never sends them, #335); a list, even an empty one, replaces them. The Price (#337) follows the same rule
// for `price` (absent keeps it); the day is stamped by the server's clock when the Price changes or `priceChecked` is sent.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const { game, creatorName } = await loadGame(db, getRouterParam(event, 'id') ?? '')
  if (!canEditGame(viewer, game)) throw apiError('not_game_editor')

  const parsed = parseGameInput(await readBody(event))
  if (!parsed.ok) throw apiError(parsed.error)

  const { tags, price, priceChecked, ...columns } = parsed.game
  const priceCols = priceColumns({ price, priceChecked }, game, useClock(event).now())
  const view = await db.transaction(async (tx) => {
    const [row] = await tx.update(games).set({ ...columns, ...priceCols }).where(eq(games.id, game.id)).returning()
    if (tags !== undefined) await saveTags(tx, game.id, tags)
    const [built] = await readGameViews(tx, [{ game: row!, creatorName }], viewer)
    return built!
  })
  return view
})
