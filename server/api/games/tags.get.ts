import { defineEventHandler } from 'h3'
import { useDb } from '../../utils/db'
import { loadTagsInUse } from '../../utils/game-tags'
import { requireLibraryViewer } from '../../utils/library'
import type { GameTag } from '../../../shared/game'

// The Tags in use (#365), for the game form's suggestions: the same answer as `tagsInUse` of the library list, without
// the games: the Tags of the viewer's own games only (#455). Only Users with the Host permission may ask; everyone else gets the answer of a missing route.
export default defineEventHandler(async (event): Promise<GameTag[]> => {
  const viewer = await requireLibraryViewer(event)
  return await loadTagsInUse(useDb(event), viewer.id)
})
