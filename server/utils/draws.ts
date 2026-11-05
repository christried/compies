import { and, eq, inArray, lte, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { draws, rounds } from '../db/schema'

/**
 * The SQL side of the one rule for what a viewer may know of a drawn game (#258): the draws of these Events that have stopped,
 * `stopAt <= now` (inclusive; the same instant as `drawGameKnown` in server/domain/pool-preview.ts, which also gives the Host
 * the game before the stop). The query joins `draws` to `rounds` (`eq(draws.roundId, rounds.id)`) and puts this in its `where`.
 * `eventIds` is a list of Event ids, or the Event column of an outer query (a correlated `exists`). A read of a drawn game
 * for a viewer who is not the Host filters with this; results, history and feed entries too, never their own comparison.
 */
export function stoppedDraws(eventIds: string[] | AnyPgColumn, now: Date): SQL {
  const inEvents = Array.isArray(eventIds) ? inArray(rounds.eventId, eventIds) : eq(rounds.eventId, eventIds)
  return and(inEvents, lte(draws.stopAt, now))!
}
