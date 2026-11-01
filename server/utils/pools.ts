import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { eventMembers, eventPoolGames, events, games } from '../db/schema'
import type { PoolFacts } from '../domain/pool-preview'
import type { Db } from './db'
import { apiError } from './errors'
import { poolGameView } from './library'
import type { EventPools } from '../../shared/event'
import { storedPoolPreview, type Pool } from '../../shared/settings'

// The pools of an Event as `GET /api/e/:slug` shows them (#146).

/**
 * Both pools of an Event, each sorted by name. The caller decides whether the viewer may see them (canSeePoolGames) and
 * does not call this otherwise, so nothing about the pools is selected for a viewer who may not see them (#148, #222, #225).
 */
export async function eventPools(db: Db, eventId: string): Promise<EventPools> {
  const rows = await db
    .select({ pool: eventPoolGames.pool, game: games })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(eq(eventPoolGames.eventId, eventId))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  const inPool = (pool: Pool) => rows.filter(row => row.pool === pool).map(row => poolGameView(row.game))
  return { main: inPool('main'), tiebreaker: inPool('tiebreaker') }
}

/** Every game of the lists must be in the library (`unknown_game` otherwise); one lookup for all of them, before anything is written (#146). */
export async function assertGamesExist(tx: Db, ...lists: string[][]): Promise<void> {
  const ids = [...new Set(lists.flat().map(id => id.toLowerCase()))]
  if (ids.length === 0) return
  const known = await tx.select({ id: games.id }).from(games).where(inArray(games.id, ids))
  if (known.length !== ids.length) throw apiError('unknown_game')
}

/**
 * The live Events `userId` is a Member of whose Game pool or Tiebreaker pool holds the game, with whether they host
 * it and whether their Pool preview is on: what the image route needs (#148, #225). One query, deleted Events left out.
 */
export async function poolEventsOf(db: Db, userId: string, gameId: string): Promise<PoolFacts[]> {
  const rows = await db
    .selectDistinct({ isHost: sql<boolean>`${events.hostId} = ${userId}`, hiddenWheel: events.hiddenWheel, poolPreview: events.poolPreview })
    .from(eventPoolGames)
    .innerJoin(events, eq(eventPoolGames.eventId, events.id))
    .innerJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
    .where(and(eq(eventPoolGames.gameId, gameId), isNull(events.deletedAt)))
  // An Event that is not set up has no Pool preview (the safe default, #183); rows the code before 0.6 wrote read as on (storedPoolPreview, #225).
  return rows.map(({ isHost, hiddenWheel, poolPreview }) => ({ isHost, poolPreview: storedPoolPreview(poolPreview, hiddenWheel) }))
}
