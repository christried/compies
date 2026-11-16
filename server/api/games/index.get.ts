import { asc, eq, sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { games } from '../../db/schema'
import { useDb } from '../../utils/db'
import { loadTagsInUse } from '../../utils/game-tags'
import { liveEventCounts, readGameViews, requireLibraryViewer } from '../../utils/library'
import type { GameList } from '../../../shared/game'

// The Game library (#141): the viewer's own games (#455), by name without regard to case. Only Users with the Host permission
// may ask; everyone else gets the answer of a missing route. There are no search parameters: the browser filters
// the whole list (`filterGames`, #173), so the library and the pool pickers search the same way and instantly. Each game
// carries its Tags, and the list the Tags in use (#335), both of the viewer's games only. `eventCounts` (#733) says in how many of the viewer's
// live Events each game sits in the pool, in one grouped statement.
export default defineEventHandler(async (event): Promise<GameList> => {
  const viewer = await requireLibraryViewer(event)

  const db = useDb(event)
  const [rows, tagsInUse, eventCounts] = await Promise.all([
    db
      .select()
      .from(games)
      .where(eq(games.createdBy, viewer.id))
      .orderBy(asc(sql`lower(${games.name})`), asc(games.id)),
    loadTagsInUse(db, viewer.id),
    liveEventCounts(db, viewer.id),
  ])

  return { games: await readGameViews(db, rows), tagsInUse, eventCounts }
})
