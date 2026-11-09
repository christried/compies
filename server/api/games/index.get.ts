import { asc, eq, sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { games, users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { loadTagsInUse } from '../../utils/game-tags'
import { creatorNameOf, gameWithCreator, readGameViews, requireLibraryViewer } from '../../utils/library'
import type { GameList } from '../../../shared/game'

// The Game library (#141): every game, by name without regard to case. Only Hosts and the Platform admin
// may ask; everyone else gets the answer of a missing route. There are no search parameters: the browser filters
// the whole list (`filterGames`, #173), so the library and the pool pickers search the same way and instantly. Each game
// carries its Tags, and the list the Tags in use (#335).
export default defineEventHandler(async (event): Promise<GameList> => {
  const viewer = await requireLibraryViewer(event)

  const db = useDb(event)
  const [rows, tagsInUse] = await Promise.all([
    db
      .select(gameWithCreator)
      .from(games)
      .innerJoin(users, eq(games.createdBy, users.id))
      .orderBy(asc(sql`lower(${games.name})`), asc(games.id)),
    loadTagsInUse(db),
  ])

  return { games: await readGameViews(db, rows.map(row => ({ game: row.game, creatorName: creatorNameOf(row) })), viewer), tagsInUse }
})
