import { and, asc, eq, sql } from 'drizzle-orm'
import { draws, eventPoolGames, games, rounds } from '../db/schema'
import { countSeats, type Place } from '../../shared/board'
import { gamesLeft, roundState, setRejection, type SetRejection } from '../../shared/rounds'
import { settingsFromRow } from '../../shared/settings'
import { recordActivity } from './activity'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange, EventRow } from './event-access'
import { readSeats } from './board'
import { eventSessions, type SessionRow } from './sessions'

// The Event's Rounds (GLOSSARY: Round, #228): the reads the rules and the Event read share, and the two changes the Host
// makes, setting the next game and putting a Round back. The rules are `shared/rounds.ts`; every instant written here
// comes from the request's clock (ADR 0013, amended 2026-10-31), never the database's `now()`.

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

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish'>

/**
 * The Host sets the next game (#228): a Round that is set at once, with one `set` draw. A game that is in the Game pool and
 * still left comes from the pool and leaves it; any other library game comes from the library and never joins a pool. No Veto
 * window opens yet (0.7-05 adds „Veto erlauben“). Refused with the reason of setRejection, or `unknown_game`.
 */
export async function setNextGame({ tx, eventRow, user, publish }: Change, now: Date, gameId: string): Promise<{ roundId: string }> {
  const [sessions, seats, roundRows, drawRows, pool] = await Promise.all([
    eventSessions(tx, eventRow.id),
    readSeats(tx, eventRow.id),
    readRounds(tx, eventRow.id),
    readDraws(tx, eventRow.id),
    readGamePool(tx, eventRow.id),
  ])
  const rejection = setRejectionOf(eventRow, sessions, seats.map(seat => seat.place), roundRows, eventRow.hostId === user.id)
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
 * The Host puts an open Round back (#228): the Round is gone, its game returns to the Game pool if it came from there (a
 * library game returns nowhere), and Vetoes spent in it stay spent (the rows stay). Only a set Round that stands can be put
 * back: an unknown or put-back one is `round_not_found`, one being drawn `round_being_drawn`.
 */
export async function putBackRound({ tx, eventRow, user, publish }: Change, now: Date, roundId: string | undefined): Promise<{ roundId: string }> {
  const round = (await readRounds(tx, eventRow.id)).find(row => row.id === roundId && row.putBackAt === null)
  if (!round) throw apiError('round_not_found')
  if (roundState(round) === 'drawn') throw apiError('round_being_drawn')

  await tx.update(rounds).set({ putBackAt: now }).where(eq(rounds.id, round.id))
  await recordActivity(tx, publish, eventRow.id, { type: 'game_put_back', actorId: user.id, params: { roundId: round.id, gameId: round.gameId! } })
  publish({ type: 'round.putBack', roundId: round.id })
  return { roundId: round.id }
}
