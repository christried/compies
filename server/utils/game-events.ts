import { and, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { GameEventRow, GameEvents } from '../../shared/game-events'
import { eventGameNotes, eventPoolGames, events, rounds, type games } from '../db/schema'
import type { Db } from './db'

/**
 * The Events of a game's User whose pool holds the game (#656, #843: an Event that only played it, outside its pool or before the game
 * left it, makes no row): at most three statements, whatever the Event count. Driven by the game id, so the indexes on
 * `event_pool_games.game_id` and `rounds.game_id` serve it and `events.host_id` needs none. `played` counts a Round once it has a
 * Result and was not put back. The Host filter keeps another Host's Event out (none can exist since 0.16-3), and a deleted Event never shows.
 */
export async function readGameEvents(db: Db, game: Pick<typeof games.$inferSelect, 'id' | 'createdBy'>): Promise<GameEvents> {
  const pooled = await db.select({ eventId: eventPoolGames.eventId }).from(eventPoolGames).where(eq(eventPoolGames.gameId, game.id))
  const ids = [...new Set(pooled.map(row => row.eventId))]
  if (ids.length === 0) return { events: [] }
  const played = await db
    .select({ eventId: rounds.eventId, played: count() })
    .from(rounds)
    .where(and(eq(rounds.gameId, game.id), inArray(rounds.eventId, ids), isNotNull(rounds.resultAt), isNull(rounds.putBackAt)))
    .groupBy(rounds.eventId)
  const playedBy = new Map(played.map(row => [row.eventId, row.played]))

  const rows = await db
    .select({ id: events.id, slug: events.slug, name: events.name, notes: eventGameNotes.notes })
    .from(events)
    .leftJoin(eventGameNotes, and(eq(eventGameNotes.eventId, events.id), eq(eventGameNotes.gameId, game.id)))
    .where(and(inArray(events.id, ids), eq(events.hostId, game.createdBy), isNull(events.deletedAt)))
    .orderBy(desc(events.createdAt), desc(events.id))
  return {
    events: rows.map((row): GameEventRow => ({ slug: row.slug, name: row.name, played: playedBy.get(row.id) ?? 0, notes: row.notes })),
  }
}
