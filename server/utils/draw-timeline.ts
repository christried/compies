import { and, eq, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { draws, rounds } from '../db/schema'
import { vetoEndCap } from '../../shared/draw-timeline'
import type { Db } from './db'

// The SQL twins of the Draw's timeline (#414): what a query needs, with the same edges as their JS counterparts in
// shared/draw-timeline.ts. `stoppedDraws` twins `drawGameKnown` for a non-Host, `dueDraws` twins `isDue`, `movedVetoEnd` twins
// `vetoEndAfterSkip` (#506); test/integration/draw-timeline.test.ts selects the same Draws through both at every boundary millisecond.

/**
 * The SQL side of the one rule for what a viewer may know of a drawn game (#258): the draws of these Events that have stopped,
 * `stopAt <= now` (inclusive; the Host gets the game before the stop, which `drawGameKnown` gives and this does not). The query
 * joins `draws` to `rounds` (`eq(draws.roundId, rounds.id)`) and puts this in its `where`. `eventIds` is a list of Event ids, or
 * the Event column of an outer query (a correlated `exists`). A read of a drawn game for a viewer who is not the Host filters with
 * this; results, history and feed entries too, never their own comparison.
 */
export function stoppedDraws(eventIds: string[] | AnyPgColumn, now: Date): SQL {
  const inEvents = Array.isArray(eventIds) ? inArray(rounds.eventId, eventIds) : eq(rounds.eventId, eventIds)
  return and(inEvents, lte(draws.stopAt, now))!
}

/**
 * The draws that are due at `now` (#229, #231, spec #218 § Deadlines): not settled, and past their last instant: the stop for a draw
 * without a Veto window, the end of the window for one with it.
 */
export function dueDraws(db: Db, eventId: string, now: Date) {
  return db
    .select({ id: draws.id, roundId: draws.roundId, gameId: draws.gameId, stopAt: draws.stopAt, vetoEndsAt: draws.vetoEndsAt })
    .from(draws)
    .innerJoin(rounds, eq(draws.roundId, rounds.id))
    .where(and(eq(rounds.eventId, eventId), isNull(draws.outcome), or(and(isNull(draws.vetoEndsAt), lte(draws.stopAt, now)), lte(draws.vetoEndsAt, now))))
}

/**
 * The SQL twin of `vetoEndAfterSkip` (#506), for the skip's `UPDATE ... SET` and for a `SELECT`: the window's end after the Host
 * skipped the Clip at `skippedAt`, which is `vetoEndCap` when that is earlier than the stored end, else the stored end. It returns
 * the whole new value where the JS rule returns null for "no change" (the parity test compares `js ?? stored`). A `CASE`, not
 * `LEAST`: Postgres' `LEAST` ignores NULL, so a draw without a window would get one.
 */
export function movedVetoEnd(skippedAt: Date) {
  const cap = sql`${vetoEndCap(skippedAt).toISOString()}::timestamptz`
  return sql<Date | null>`case when ${draws.vetoEndsAt} > ${cap} then ${cap} else ${draws.vetoEndsAt} end`
}
