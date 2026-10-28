import { and, arrayContains, asc, count, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { defineEventHandler, getQuery } from 'h3'
import { games, users } from '../../db/schema'
import { escapeLike, parseGameFilters } from '../../domain/game'
import { useDb } from '../../utils/db'
import { creatorNameOf, gameView, gameWithCreator, requireLibraryViewer } from '../../utils/library'
import type { GameList } from '../../../shared/game'

// The Game library (#141): every game, by name without regard to case. Only Hosts and the Platform admin
// may ask; everyone else gets the answer of a missing route. The filters of #142 combine with AND: a name
// search, a player count the recommended range covers (a game without any count never matches one), a
// Suitability („Passt zu“, #171) and the viewer's own games. `total` counts the whole library, whatever the filters keep.
export default defineEventHandler(async (event): Promise<GameList> => {
  const viewer = await requireLibraryViewer(event)
  const filters = parseGameFilters(getQuery(event))
  const db = useDb(event)

  const conditions = []
  if (filters.q !== null) conditions.push(ilike(games.name, `%${escapeLike(filters.q)}%`))
  if (filters.players !== null) {
    const players = filters.players
    conditions.push(
      or(isNull(games.playersMin), lte(games.playersMin, players)),
      or(isNull(games.playersMax), gte(games.playersMax, players)),
      or(isNotNull(games.playersMin), isNotNull(games.playersMax)),
    )
  }
  if (filters.suitability !== null) conditions.push(arrayContains(games.suitabilities, [filters.suitability]))
  if (filters.mine) conditions.push(eq(games.createdBy, viewer.id))

  const rows = await db
    .select(gameWithCreator)
    .from(games)
    .innerJoin(users, eq(games.createdBy, users.id))
    .where(and(...conditions))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))

  const [counted] = await db.select({ total: count() }).from(games)

  return {
    games: rows.map(row => gameView(row.game, creatorNameOf(row), viewer)),
    total: counted?.total ?? 0,
  }
})
