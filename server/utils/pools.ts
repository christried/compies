import { and, asc, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm'
import { draws, eventMembers, eventPoolGames, events, games, rounds } from '../db/schema'
import type { GameFacts } from '../domain/pool-preview'
import type { Db } from './db'
import { stoppedDraws } from './draw-timeline'
import { apiError } from './errors'
import { poolGameFace, poolGameView } from './library'
import type { PoolGame, PoolGameFace } from '../../shared/game'
import { storedPoolPreview } from '../../shared/settings'

// The Game pool of an Event as `GET /api/e/:slug` shows it (#146). One pool since 0.8 (ADR 0014, #279, #286).

/**
 * The 0.8 client sent the pool as `pools: { main: [...] }`. A body with a `pools` key, whatever its value, is refused
 * before anything is written, so a client that is still open never has its pool silently ignored (#286).
 */
export function assertNoOldPools(body: Record<string, unknown>): void {
  if ('pools' in body) throw apiError('invalid_pools')
}

/**
 * The Game pool of an Event, sorted by name. The caller decides whether the viewer may see it (canSeePoolGames) and
 * does not call this otherwise, so nothing about the pool is selected for a viewer who may not see it (#148, #222, #225).
 * Only the Host gets the games whole; every other Member gets picture, name, Price, players and Suitabilities (#224, #338, #444).
 */
export async function eventPool(db: Db, eventId: string, isHost: boolean): Promise<(PoolGame | PoolGameFace)[]> {
  const rows = await db
    .select({ game: games })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(eq(eventPoolGames.eventId, eventId))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  return rows.map(row => (isHost ? poolGameView(row.game) : poolGameFace(row.game)))
}

/** Every game of the lists must be in the library (`unknown_game` otherwise); one lookup for all of them, before anything is written (#146). */
export async function assertGamesExist(tx: Db, ...lists: string[][]): Promise<void> {
  const ids = [...new Set(lists.flat().map(id => id.toLowerCase()))]
  if (ids.length === 0) return
  const known = await tx.select({ id: games.id }).from(games).where(inArray(games.id, ids))
  if (known.length !== ids.length) throw apiError('unknown_game')
}

/**
 * The live Events `userId` is a Member of whose Game pool holds the game, or in which a Round has set it, with whether
 * they host it, whether their Pool preview is on and whether a Round set the game: what the image route needs (#148,
 * #225, #228). One query, deleted Events left out. A Round that was put back still counts as set: everyone saw it.
 */
export async function gameEventsOf(db: Db, userId: string, gameId: string, now: Date): Promise<GameFacts[]> {
  const inPool = exists(db.select({ one: sql`1` }).from(eventPoolGames).where(and(eq(eventPoolGames.eventId, events.id), eq(eventPoolGames.gameId, gameId))))
  // A game is set once a Round has it, or a draw of the Event has it and stopped (#229): a draw whose stop has passed but nobody has
  // read since is not settled yet, and its image must not wait for that.
  const stopped = exists(db.select({ one: sql`1` }).from(draws).innerJoin(rounds, eq(draws.roundId, rounds.id)).where(and(stoppedDraws(events.id, now), eq(draws.gameId, gameId))))
  const wasSet = or(exists(db.select({ one: sql`1` }).from(rounds).where(and(eq(rounds.eventId, events.id), eq(rounds.gameId, gameId)))), stopped)
  const found = await db
    .selectDistinct({ isHost: sql<boolean>`${events.hostId} = ${userId}`, hiddenWheel: events.hiddenWheel, poolPreview: events.poolPreview, set: sql<boolean>`${wasSet}` })
    .from(events)
    .innerJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
    .where(and(isNull(events.deletedAt), or(inPool, wasSet)))
  // An Event that is not set up has no Pool preview (the safe default, #183); rows the code before 0.6 wrote read as on (storedPoolPreview, #225).
  return found.map(({ isHost, hiddenWheel, poolPreview, set }) => ({ isHost, poolPreview: storedPoolPreview(poolPreview, hiddenWheel), set }))
}
