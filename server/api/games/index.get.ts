import { asc, eq, sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { games, users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { gameView, requireLibraryViewer } from '../../utils/library'
import type { GameList } from '../../../shared/game'

// The Game library (#141): every game, by name without regard to case. Only Hosts and the Platform admin
// may ask; everyone else gets the answer of a missing route.
export default defineEventHandler(async (event): Promise<GameList> => {
  const viewer = await requireLibraryViewer(event)

  const rows = await useDb(event)
    .select({ game: games, creatorName: users.name, creatorDisplayName: users.displayName })
    .from(games)
    .innerJoin(users, eq(games.createdBy, users.id))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))

  return { games: rows.map(row => gameView(row.game, row.creatorDisplayName ?? row.creatorName, viewer)) }
})
