import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import { draws, rounds, vetoes } from '../db/schema'
import { drawOutcome } from '../../shared/rounds'
import { recordActivity } from './activity'
import type { Db } from './db'
import type { EventRow } from './event-access'

// Settling what an instant that has passed decides (#229, #231). Its own module because `changeEvent` calls it for every change that
// holds the Event lock (#259), and rounds.ts imports sessions.ts, which imports `changeEvent`: the settle must not sit behind that cycle.

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
 * Settles what an instant that has passed decides (#229, #231, spec #218 § Deadlines: no timer runs, the first read or write after
 * the instant settles it), in the caller's transaction under the Event row lock. One arm per kind of instant. A draw without a
 * Veto window is set at its stop. A draw with one settles at the end of the window: its outcome follows from its Vetoes
 * (drawOutcome). Set, its Round has the game; vetoed, the Round stays without a game and waits for a respin, and the feed gets
 * „vetoes_revealed“ with the Parties that cast them (#355: not the Players). Everything is stamped with the instant that decided it, not with `now`. Idempotent: a
 * settled draw has an outcome and is not due again.
 */
export async function settleDue(tx: Db, eventRow: Pick<EventRow, 'id'>, now: Date): Promise<void> {
  for (const draw of await dueDraws(tx, eventRow.id, now)) {
    const settledAt = draw.vetoEndsAt ?? draw.stopAt
    const casts = draw.vetoEndsAt ? await tx.select({ team: vetoes.team }).from(vetoes).where(eq(vetoes.drawId, draw.id)).orderBy(asc(vetoes.team)) : []
    const outcome = drawOutcome(casts.length)
    const [settled] = await tx.update(draws).set({ outcome, settledAt }).where(and(eq(draws.id, draw.id), isNull(draws.outcome))).returning({ id: draws.id })
    if (!settled) continue
    if (outcome === 'set') await tx.update(rounds).set({ gameId: draw.gameId, setAt: settledAt }).where(eq(rounds.id, draw.roundId))
    // The entry waits for the instant it carries (`at`), so nothing is published: the clients refetch the feed when it passes.
    else await recordActivity(tx, () => {}, eventRow.id, { type: 'vetoes_revealed', actorId: null, params: { roundId: draw.roundId, drawId: draw.id, gameId: draw.gameId, vetoes: casts }, at: settledAt })
  }
}
