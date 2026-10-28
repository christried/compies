import { defineEventHandler, readBody } from 'h3'
import { games } from '../../db/schema'
import { parseGameInput } from '../../domain/game'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { creatorNameOf, gameView, requireLibraryViewer } from '../../utils/library'
import type { GameView } from '../../../shared/game'

// Creates a game in the library (#141). Games are never deleted, so Events that use one keep working.
export default defineEventHandler(async (event): Promise<GameView> => {
  const viewer = await requireLibraryViewer(event)

  const parsed = parseGameInput(await readBody(event))
  if (!parsed.ok) throw apiError(parsed.error)

  const [row] = await useDb(event)
    .insert(games)
    .values({ ...parsed.game, createdBy: viewer.id })
    .returning()
  return gameView(row!, creatorNameOf({ creatorName: viewer.name, creatorDisplayName: viewer.displayName }), viewer)
})
