import { asc, eq, inArray, sql } from 'drizzle-orm'
import { eventPoolGames, games } from '../db/schema'
import type { Db } from './db'
import { apiError } from './errors'
import { poolGameView } from './library'
import type { EventPools } from '../../shared/event'

// The pools of an Event as `GET /api/e/:slug` shows them (#146).

/**
 * Both pools of an Event. With `visible` the games, each pool sorted by name; without it only the counts, and no
 * game name or id is even selected, so none can leak into the response (#148).
 */
export async function eventPools(db: Db, eventId: string, visible: boolean): Promise<EventPools> {
  if (!visible) {
    const counts = await db
      .select({ pool: eventPoolGames.pool, count: sql<number>`count(*)::int` })
      .from(eventPoolGames)
      .where(eq(eventPoolGames.eventId, eventId))
      .groupBy(eventPoolGames.pool)
    const countOf = (pool: 'main' | 'tiebreaker') => counts.find(row => row.pool === pool)?.count ?? 0
    return { hidden: true, mainCount: countOf('main'), tiebreakerCount: countOf('tiebreaker') }
  }
  const rows = await db
    .select({ pool: eventPoolGames.pool, game: games })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(eq(eventPoolGames.eventId, eventId))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  const inPool = (pool: 'main' | 'tiebreaker') => rows.filter(row => row.pool === pool).map(row => poolGameView(row.game))
  return { hidden: false, main: inPool('main'), tiebreaker: inPool('tiebreaker') }
}

/** Every game of the lists must be in the library (`unknown_game` otherwise); one lookup for all of them, before anything is written (#146). */
export async function assertGamesExist(tx: Db, ...lists: string[][]): Promise<void> {
  const ids = [...new Set(lists.flat().map(id => id.toLowerCase()))]
  if (ids.length === 0) return
  const known = await tx.select({ id: games.id }).from(games).where(inArray(games.id, ids))
  if (known.length !== ids.length) throw apiError('unknown_game')
}
