import { eq } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { games } from '../../db/schema'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { gameView, loadGame, loadTags, priceColumns, requireLibraryViewer, saveTags } from '../../utils/library'
import { useClock } from '../../utils/clock'
import { canEditGame, isPriceCheckOnly, parseGameInput, type GameView } from '../../../shared/game'

// Edits a game of the library (#142). The body is the whole game, as the form sends it, except that `{ priceChecked: true }`
// alone restamps the Price day and nothing else (#360). Only the creator and the Platform admin may edit; another Host
// gets not_game_editor, and a Member or an unknown game the answer of a missing route. The image and the creator stay as
// they are. A body without `tags` keeps the game's Tags (a 0.9 tab never sends them, #335); a list, even an empty one,
// replaces them. The Price (#337) follows the same rule for `price` (absent keeps it); the day is stamped by the server's
// clock when the Price changes or `priceChecked` is sent. The Price day is decided on the row read inside the transaction,
// under a lock (#360), not on the row read above.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)
  const db = useDb(event)
  const { game, creatorName } = await loadGame(db, getRouterParam(event, 'id') ?? '')
  if (!canEditGame(viewer, game)) throw apiError('not_game_editor')

  const body = await readBody(event)
  // The flag alone writes nothing but the Price day: no columns, no Tags, no Price (#360).
  const parsed = isPriceCheckOnly(body) ? null : parseGameInput(body)
  if (parsed && !parsed.ok) throw apiError(parsed.error)
  const pieces = parsed?.ok ? parsed.game : { tags: undefined, price: undefined, priceChecked: true }

  const { tags, price, priceChecked, ...columns } = pieces
  const now = useClock(event).now()
  const { updated, stored } = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(games).where(eq(games.id, game.id)).for('update')
    const priceCols = priceColumns({ price, priceChecked }, current!, now)
    const [row] = await tx.update(games).set({ ...columns, ...priceCols }).where(eq(games.id, game.id)).returning()
    if (tags !== undefined) await saveTags(tx, game.id, tags)
    return { updated: row!, stored: await loadTags(tx, [game.id]) }
  })
  return gameView(updated, creatorName, viewer, stored.get(game.id) ?? [])
})
