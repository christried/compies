import { defineEventHandler, readBody } from 'h3'
import { games } from '../../db/schema'
import { parseGameInput, tagsWithFreeToPlay, type GameView } from '../../../shared/game'
import { useClock } from '../../utils/clock'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { saveTags } from '../../utils/game-tags'
import { creatorNameOf, priceColumns, readGameViews, requireLibraryViewer } from '../../utils/library'

// Creates a game in the library (#141). Games are never deleted, so Events that use one keep working. The Tags (#335) are
// stored with the game in one transaction, and the answer carries them as stored, so a spelling taken over from the library shows.
// The Tag „Free-to-play“ follows the Price (#423): tagsWithFreeToPlay decides the stored Tags from the Price the game is created with.
// The Price (#337) is stamped with the server's clock; a flag with no Price is refused before anything is written.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)

  const parsed = parseGameInput(await readBody(event))
  if (!parsed.ok) throw apiError(parsed.error)

  const { tags, price, priceChecked, ...columns } = parsed.game
  const priceCols = priceColumns({ price, priceChecked }, null, useClock(event).now())
  const view = await useDb(event).transaction(async (tx) => {
    const [inserted] = await tx.insert(games).values({ ...columns, ...priceCols, createdBy: viewer.id }).returning()
    await saveTags(tx, inserted!.id, tagsWithFreeToPlay(tags ?? [], price ?? null))
    const creatorName = creatorNameOf({ creatorName: viewer.name, creatorDisplayName: viewer.displayName })
    const [built] = await readGameViews(tx, [{ game: inserted!, creatorName }], viewer)
    return built!
  })
  return view
})
