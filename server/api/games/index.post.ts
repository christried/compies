import { defineEventHandler, readBody } from 'h3'
import { games } from '../../db/schema'
import { parseGameInput, type GameView } from '../../../shared/game'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { creatorNameOf, gameView, loadTags, requireLibraryViewer, saveTags } from '../../utils/library'

// Creates a game in the library (#141). Games are never deleted, so Events that use one keep working. The Tags (#335) are
// stored with the game in one transaction, and the answer carries them as stored, so a spelling taken over from the library shows.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)

  const parsed = parseGameInput(await readBody(event))
  if (!parsed.ok) throw apiError(parsed.error)

  const { tags, ...columns } = parsed.game
  const { row, stored } = await useDb(event).transaction(async (tx) => {
    const [inserted] = await tx.insert(games).values({ ...columns, createdBy: viewer.id }).returning()
    await saveTags(tx, inserted!.id, tags ?? [])
    return { row: inserted!, stored: await loadTags(tx, [inserted!.id]) }
  })
  return gameView(row, creatorNameOf({ creatorName: viewer.name, creatorDisplayName: viewer.displayName }), viewer, stored.get(row.id) ?? [])
})
