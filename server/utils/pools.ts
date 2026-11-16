import { and, asc, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm'
import { draws, eventMembers, eventPoolGames, events, games, rounds } from '../db/schema'
import type { GameFacts } from '../domain/pool-preview'
import type { Db } from './db'
import { stoppedDraws } from './draw-timeline'
import { apiError } from './errors'
import { poolGameFace, poolGameView } from './library'
import type { PoolGame, PoolGameFace } from '../../shared/game'
import { beforeFinish, PHASES } from '../../shared/phase'
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
 * Only games of the Event's Host's library are in it (`games.created_by = events.host_id`, #722, ADR 0018): a pool row of another Host's game,
 * which the 0.15 code could still write while a migration ran (ADR 0007), reaches no list.
 * The two reads differ in the Archived games (#725, spec #717 § B): the Host's list carries every pool game, since it is the list a pool change sends
 * back whole and the Host sees what is archived (the flag is #726's); a Member's leaves them out, as it leaves out the wheel's slices. A Member's list is the only
 * Member surface that names the pool, and every count a Member sees comes from the games left (the state), which has no Archived game either.
 */
export async function eventPool(db: Db, eventId: string, hostId: string, isHost: boolean): Promise<(PoolGame | PoolGameFace)[]> {
  const rows = await db
    .select({ game: games })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(and(eq(eventPoolGames.eventId, eventId), eq(games.createdBy, hostId), isHost ? undefined : isNull(games.archivedAt)))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  return rows.map(row => (isHost ? poolGameView(row.game) : poolGameFace(row.game)))
}

/**
 * Every game of the lists must be in the Event's Host's library (`unknown_game` otherwise; another Host's game answers as an absent one, #722); one
 * lookup for all of them, before anything is written (#146).
 */
export async function assertGamesExist(tx: Db, hostId: string, ...lists: string[][]): Promise<void> {
  const ids = [...new Set(lists.flat().map(id => id.toLowerCase()))]
  if (ids.length === 0) return
  const known = await tx.select({ id: games.id }).from(games).where(and(inArray(games.id, ids), eq(games.createdBy, hostId)))
  if (known.length !== ids.length) throw apiError('unknown_game')
}

/**
 * The check of a pool change (#725, spec #717 § B „Setting and pooling“): every game of the list must be in the Event's Host's library and not Archived,
 * unless the Event's pool already holds it (`unknown_game` otherwise, one lookup for all of them, before anything is written). A pool change replaces the whole
 * list and the Host's own pool shows the Archived game, so the client sends it back; refusing it would silently drop it. An Archived game is only
 * added by a restore first. `eventId` is null for a new Event, which has no pool yet: an Archived game never counts then. Event notes keep `assertGamesExist`,
 * since they take an Archived game too (#731).
 */
export async function assertPoolGames(tx: Db, hostId: string, eventId: string | null, pool: string[]): Promise<void> {
  const ids = [...new Set(pool.map(id => id.toLowerCase()))]
  if (ids.length === 0) return
  const pooled = eventId === null ? undefined : exists(tx.select({ one: sql`1` }).from(eventPoolGames).where(and(eq(eventPoolGames.eventId, eventId), eq(eventPoolGames.gameId, games.id))))
  const known = await tx.select({ id: games.id }).from(games).where(and(inArray(games.id, ids), eq(games.createdBy, hostId), or(isNull(games.archivedAt), pooled)))
  if (known.length !== ids.length) throw apiError('unknown_game')
}

/**
 * The ids of the Events a game's archive or restore reaches (#725, ADR 0013): the owner's Events (`events.hostId`, ADR 0018: another Host's Event holds a
 * copy, a different row) whose pool holds the game, that are not deleted and not finished (`beforeFinish`). One statement; the route publishes to each.
 */
export async function liveEventsHolding(db: Db, gameId: string, hostId: string): Promise<string[]> {
  const found = await db
    .select({ id: events.id })
    .from(events)
    .innerJoin(eventPoolGames, eq(eventPoolGames.eventId, events.id))
    .where(and(eq(events.hostId, hostId), isNull(events.deletedAt), inArray(events.phase, PHASES.filter(beforeFinish)), eq(eventPoolGames.gameId, gameId)))
  return found.map(row => row.id)
}

/**
 * The live Events `userId` is a Member of whose Game pool holds a game with the image key, or in which a Round has set one, with whether
 * they host it, whether their Pool preview is on and whether a Round set the game: what the image route needs (#148,
 * #225, #228). Copies of a game share a key (ADR 0018), so it asks by key, not by game (#723). One query, deleted Events left out. An Archived game counts as in a pool no more (#725); one a Round or a draw has set still counts as set.
 * A Round that was put back still counts as set: everyone saw it.
 */
export async function gameEventsOf(db: Db, userId: string, imageKey: string, now: Date): Promise<GameFacts[]> {
  const withKey = db.select({ id: games.id }).from(games).where(eq(games.imageKey, imageKey))
  // The picture follows the pool (#725): an Archived pool game is on no Member's list, so its picture is out too. A game a Round has set or a draw has stopped on
  // stays visible whatever its state, so the Round and the draw terms below use the plain `withKey`.
  const inPool = exists(db.select({ one: sql`1` }).from(eventPoolGames).where(and(eq(eventPoolGames.eventId, events.id), inArray(eventPoolGames.gameId, db.select({ id: games.id }).from(games).where(and(eq(games.imageKey, imageKey), isNull(games.archivedAt)))))))
  // A game is set once a Round has it, or a draw of the Event has it and stopped (#229): a draw whose stop has passed but nobody has
  // read since is not settled yet, and its image must not wait for that.
  const stopped = exists(db.select({ one: sql`1` }).from(draws).innerJoin(rounds, eq(draws.roundId, rounds.id)).where(and(stoppedDraws(events.id, now), inArray(draws.gameId, withKey))))
  const wasSet = or(exists(db.select({ one: sql`1` }).from(rounds).where(and(eq(rounds.eventId, events.id), inArray(rounds.gameId, withKey)))), stopped)
  const found = await db
    .selectDistinct({ isHost: sql<boolean>`${events.hostId} = ${userId}`, hiddenWheel: events.hiddenWheel, poolPreview: events.poolPreview, set: sql<boolean>`${wasSet}` })
    .from(events)
    .innerJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
    .where(and(isNull(events.deletedAt), or(inPool, wasSet)))
  // An Event that is not set up has no Pool preview (the safe default, #183); rows the code before 0.6 wrote read as on (storedPoolPreview, #225).
  return found.map(({ isHost, hiddenWheel, poolPreview, set }) => ({ isHost, poolPreview: storedPoolPreview(poolPreview, hiddenWheel), set }))
}
