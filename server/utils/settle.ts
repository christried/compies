import { and, asc, eq, isNull } from 'drizzle-orm'
import { draws, rounds, vetoes } from '../db/schema'
import { settleAt } from '../../shared/draw-timeline'
import { drawOutcome } from '../../shared/rounds'
import { feedTeamNames, recordActivity } from './activity'
import type { Db } from './db'
import { dueDraws } from './draw-timeline'
import type { EventRow } from './event-access'

// Settling what an instant that has passed decides (#229, #231). Its own module because `changeEvent` calls it for every change that
// holds the Event lock (#259), and rounds.ts imports sessions.ts, which imports `changeEvent`: the settle must not sit behind that cycle.

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
    const settledAt = settleAt(draw)
    const casts = draw.vetoEndsAt ? await tx.select({ team: vetoes.team }).from(vetoes).where(eq(vetoes.drawId, draw.id)).orderBy(asc(vetoes.team)) : []
    const outcome = drawOutcome(casts.length)
    const [settled] = await tx.update(draws).set({ outcome, settledAt }).where(and(eq(draws.id, draw.id), isNull(draws.outcome))).returning({ id: draws.id })
    if (!settled) continue
    if (outcome === 'set') await tx.update(rounds).set({ gameId: draw.gameId, setAt: settledAt }).where(eq(rounds.id, draw.roundId))
    // The entry waits for the instant it carries (`at`), so nothing is published: the clients refetch the feed when it passes.
    else {
      // The Team names are read here, in the branch that writes the entry, and hold the casting Parties only (#440): the entry names them anyway,
      // from this instant on, and a cast itself writes nothing. The entry is written by the first read or write after the window's end (no timer),
      // so a rename between the end and that first read lands in the name: accepted, the name is the one the team has when the entry is written.
      const teamNames = await feedTeamNames(tx, eventRow.id, casts.map(cast => cast.team))
      await recordActivity(tx, () => {}, eventRow.id, { type: 'vetoes_revealed', actorId: null, params: { roundId: draw.roundId, drawId: draw.id, gameId: draw.gameId, vetoes: casts, teamNames }, at: settledAt })
    }
  }
}
