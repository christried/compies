import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { draws, eventPoolGames, events, games, rounds } from '../db/schema'
import { WHEEL_PLACEHOLDERS, drawSpin } from '../domain/wheel'
import { countSeats, type Place } from '../../shared/board'
import { isoInstant } from '../../shared/activity'
import type { RoundSpun } from '../../shared/event'
import { SPIN_DURATION_MS, SPIN_LEAD_MS, gamesLeft, roundState, setRejection, spinRejection, type SetRejection, type SpinRejection } from '../../shared/rounds'
import { settingsFromRow } from '../../shared/settings'
import { recordActivity } from './activity'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange, EventRow } from './event-access'
import { readSeats } from './board'
import { eventSessions, type SessionRow } from './sessions'

// The Event's Rounds (GLOSSARY: Round, #228): the reads the rules and the Event read share, and the changes the Host
// makes, setting the next game, spinning the wheel and putting a Round back. The rules are `shared/rounds.ts`; every instant
// written here comes from the request's clock (ADR 0013, amended 2026-10-31), never the database's `now()`.

export type RoundRow = typeof rounds.$inferSelect
export type DrawRow = typeof draws.$inferSelect

/** The Event's Rounds in start order, the put-back ones too (the rules decide what they count for). */
export function readRounds(db: Db, eventId: string): Promise<RoundRow[]> {
  return db.select().from(rounds).where(eq(rounds.eventId, eventId)).orderBy(asc(rounds.startedAt), asc(rounds.id))
}

/** Every draw of the Event's Rounds. */
export async function readDraws(db: Db, eventId: string): Promise<DrawRow[]> {
  const found = await db.select({ draw: draws }).from(draws).innerJoin(rounds, eq(draws.roundId, rounds.id)).where(eq(rounds.eventId, eventId))
  return found.map(row => row.draw)
}

/** The ids of the games in the Game pool, in the order of their names (the order the pools show them in). */
export async function readGamePool(db: Db, eventId: string): Promise<string[]> {
  const found = await db
    .select({ id: games.id })
    .from(eventPoolGames)
    .innerJoin(games, eq(eventPoolGames.gameId, games.id))
    .where(and(eq(eventPoolGames.eventId, eventId), eq(eventPoolGames.pool, 'main')))
    .orderBy(asc(sql`lower(${games.name})`), asc(games.id))
  return found.map(row => row.id)
}

/** Why the Host cannot set the next game now, or null (shared/rounds.ts setRejection), from the rows the callers have read. */
export function setRejectionOf(eventRow: EventRow, sessions: readonly SessionRow[], places: readonly Place[], roundRows: readonly RoundRow[], isHost: boolean): SetRejection | null {
  return setRejection({ isHost, settings: settingsFromRow(eventRow), sessions, seats: countSeats(places), rounds: roundRows })
}

/** Why the Host cannot spin the wheel now, or null (shared/rounds.ts spinRejection): the same rows, and the games left on the wheel. */
export function spinRejectionOf(eventRow: EventRow, sessions: readonly SessionRow[], places: readonly Place[], roundRows: readonly RoundRow[], left: readonly string[], isHost: boolean): SpinRejection | null {
  return spinRejection({ isHost, settings: settingsFromRow(eventRow), sessions, seats: countSeats(places), rounds: roundRows, left })
}

/** The draws that are due at `now` (#229, spec #218 § Deadlines): not settled, stopped, and without a Veto window to wait for. */
function dueDraws(db: Db, eventId: string, now: Date) {
  return db
    .select({ id: draws.id, roundId: draws.roundId, gameId: draws.gameId, stopAt: draws.stopAt })
    .from(draws)
    .innerJoin(rounds, eq(draws.roundId, rounds.id))
    .where(and(eq(rounds.eventId, eventId), isNull(draws.outcome), isNull(draws.vetoEndsAt), lte(draws.stopAt, now)))
}

/**
 * Settles what an instant that has passed decides (#229, spec #218 § Deadlines: no timer runs, the first read or write after the
 * instant settles it), in the caller's transaction under the Event row lock. One arm per kind of instant. Every draw without a
 * Veto window is set at its stop: the draw's outcome is `set` and its Round has the game, both stamped with the stop instant,
 * not with `now`. Idempotent: a settled draw has an outcome and is not due again. 0.7-06 adds the arm of the Veto window's end.
 */
export async function settleDue(tx: Db, eventRow: Pick<EventRow, 'id'>, now: Date): Promise<void> {
  for (const draw of await dueDraws(tx, eventRow.id, now)) {
    const [settled] = await tx.update(draws).set({ outcome: 'set', settledAt: draw.stopAt }).where(and(eq(draws.id, draw.id), isNull(draws.outcome))).returning({ id: draws.id })
    if (settled) await tx.update(rounds).set({ gameId: draw.gameId, setAt: draw.stopAt }).where(eq(rounds.id, draw.roundId))
  }
}

/**
 * The Event read's share (#229): when a draw is due, settle it in a locked transaction before reading. The check is one cheap
 * select, so a read with nothing due stays lock-free; the settle re-checks under the lock, so two readers settle it once.
 */
export async function settleBeforeRead(db: Db, eventRow: Pick<EventRow, 'id'>, now: Date): Promise<void> {
  if ((await dueDraws(db, eventRow.id, now).limit(1)).length === 0) return
  await db.transaction(async (tx) => {
    await tx.select({ id: events.id }).from(events).where(eq(events.id, eventRow.id)).for('update')
    await settleDue(tx, eventRow, now)
  })
}

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish'>

/** What the rules of a round change read in its transaction, all at the same time. */
async function readRoundFacts(tx: Db, eventRow: EventRow) {
  const [sessions, seats, roundRows, drawRows, pool] = await Promise.all([
    eventSessions(tx, eventRow.id),
    readSeats(tx, eventRow.id),
    readRounds(tx, eventRow.id),
    readDraws(tx, eventRow.id),
    readGamePool(tx, eventRow.id),
  ])
  return { sessions, places: seats.map(seat => seat.place), roundRows, drawRows, pool }
}

/**
 * The Host sets the next game (#228): a Round that is set at once, with one `set` draw. A game that is in the Game pool and
 * still left comes from the pool and leaves it; any other library game comes from the library and never joins a pool. No Veto
 * window opens yet (0.7-05 adds „Veto erlauben“). Refused with the reason of setRejection, or `unknown_game`.
 */
export async function setNextGame({ tx, eventRow, user, publish }: Change, now: Date, gameId: string): Promise<{ roundId: string }> {
  await settleDue(tx, eventRow, now)
  const { sessions, places, roundRows, drawRows, pool } = await readRoundFacts(tx, eventRow)
  const rejection = setRejectionOf(eventRow, sessions, places, roundRows, eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)
  const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, gameId))
  if (!game) throw apiError('unknown_game')

  const source = gamesLeft(pool, drawRows, roundRows).includes(game.id) ? 'pool' : 'library'
  const [round] = await tx.insert(rounds).values({ eventId: eventRow.id, gameId: game.id, startedAt: now, setAt: now }).returning({ id: rounds.id })
  await tx.insert(draws).values({ roundId: round!.id, gameId: game.id, source, kind: 'set', committedAt: now, stopAt: now, outcome: 'set', settledAt: now })
  await recordActivity(tx, publish, eventRow.id, { type: 'game_set', actorId: user.id, params: { roundId: round!.id, gameId: game.id } })
  publish({ type: 'round.set', roundId: round!.id })
  return { roundId: round!.id }
}

/**
 * The Host spins the Lucky Wheel (#229, spec #218 § Drawing): the server draws one of the games left, uniformly. The Round is
 * being drawn (no game yet) and its `spin` draw is stored with everything a reload replays. The spin starts a lead after the
 * commit, so every client has the message and starts together, and stops after its duration; the draw settles at the stop
 * (settleDue), no Veto window opens yet (0.7-06). The feed's entry waits for the stop (`at`, not published). The message
 * carries the slice count, the placeholders of a Hidden wheel and the instants, never a game. Refused with the reason of
 * spinRejection.
 */
export async function spinWheel({ tx, eventRow, user, publish }: Change, now: Date, randomInt: (n: number) => number): Promise<RoundSpun> {
  await settleDue(tx, eventRow, now)
  const { sessions, places, roundRows, drawRows, pool } = await readRoundFacts(tx, eventRow)
  const left = gamesLeft(pool, drawRows, roundRows)
  const rejection = spinRejectionOf(eventRow, sessions, places, roundRows, left, eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)
  // The rules above refused an Event without settings.
  const hidden = settingsFromRow(eventRow)!.hiddenWheel

  const spin = drawSpin(left, hidden ? WHEEL_PLACEHOLDERS : null, randomInt)
  const spinStartAt = new Date(now.getTime() + SPIN_LEAD_MS)
  const stopAt = new Date(spinStartAt.getTime() + SPIN_DURATION_MS)
  const gameId = spin.sliceGameIds[spin.resultIndex]!
  const [round] = await tx.insert(rounds).values({ eventId: eventRow.id, startedAt: now }).returning({ id: rounds.id })
  const [draw] = await tx.insert(draws).values({
    roundId: round!.id,
    gameId,
    source: 'pool',
    kind: 'spin',
    committedAt: now,
    spinStartAt,
    stopAt,
    sliceGameIds: spin.sliceGameIds,
    sliceLabels: spin.sliceLabels,
    resultIndex: spin.resultIndex,
    resultOffset: spin.resultOffset,
  }).returning({ id: draws.id })
  await recordActivity(tx, publish, eventRow.id, { type: 'game_drawn', actorId: null, params: { roundId: round!.id, drawId: draw!.id, gameId }, at: stopAt })
  publish({
    type: 'round.spun',
    roundId: round!.id,
    drawId: draw!.id,
    spinStartAt: isoInstant(spinStartAt),
    stopAt: isoInstant(stopAt),
    slices: spin.sliceGameIds.length,
    resultIndex: spin.resultIndex,
    resultOffset: spin.resultOffset,
    labels: spin.sliceLabels,
  })
  return { roundId: round!.id, drawId: draw!.id }
}

/**
 * The Host puts an open Round back (#228): the Round is gone, its game returns to the Game pool if it came from there (a
 * library game returns nowhere), and Vetoes spent in it stay spent (the rows stay). Only a set Round that stands can be put
 * back: an unknown or put-back one is `round_not_found`, one being drawn `round_being_drawn`.
 */
export async function putBackRound({ tx, eventRow, user, publish }: Change, now: Date, roundId: string | undefined): Promise<{ roundId: string }> {
  await settleDue(tx, eventRow, now)
  const round = (await readRounds(tx, eventRow.id)).find(row => row.id === roundId && row.putBackAt === null)
  if (!round) throw apiError('round_not_found')
  if (roundState(round) === 'drawn') throw apiError('round_being_drawn')

  await tx.update(rounds).set({ putBackAt: now }).where(eq(rounds.id, round.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'game_put_back', actorId: user.id, params: { roundId: round.id, gameId: round.gameId! } })
  publish({ type: 'round.putBack', roundId: round.id })
  return { roundId: round.id }
}
