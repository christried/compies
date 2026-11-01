// The Event's Rounds (GLOSSARY: Round, Game pool, Game count; spec #218 § Rounds, #228). Pure, so the server enforces the
// rules and the client shows the same facts: which games are left in the Game pool, which Rounds are open, how many have
// started (the Game count's floor) and why the Host cannot set the next game now. The Worker does not import this file.
// 0.7-04 and 0.7-06 add the spin and the Veto window to the same module as more arms of a Round's draws.

import type { Seats } from './board'
import { runningOf, teamsRejection, type Instant, type SessionTimes, type TeamsRejection } from './session-state'
import type { EventSettings } from './settings'

/** Where a draw's game came from: the Game pool, or the library beyond it. A library game never joins a pool (spec #218 § Rounds). */
export const DRAW_SOURCES = ['pool', 'library'] as const
export type DrawSource = (typeof DRAW_SOURCES)[number]

/** How a game was determined: the wheel spun it, or the Host set it. */
export const DRAW_KINDS = ['spin', 'set'] as const

/** How a draw ended: its game was vetoed, or it was set. A draw has none until it settles. */
export const DRAW_OUTCOMES = ['vetoed', 'set'] as const
export type DrawOutcome = (typeof DRAW_OUTCOMES)[number]

/** The sides of the coin (`coin_tossed` has the same two). */
export const COIN_SIDES = ['heads', 'tails'] as const

/** What the rules need of a Round: its id and the two instants that decide its state. */
export interface RoundFacts {
  id: string
  /** When its game was set; null while it is being drawn. */
  setAt: Instant | null
  /** When the Host put it back; null while it stands. A put-back Round is gone. */
  putBackAt: Instant | null
}

/** What the rules need of a draw: its Round, its game, where the game came from and how it ended (null while open). */
export interface DrawFacts {
  roundId: string
  gameId: string
  source: DrawSource
  outcome: DrawOutcome | null
}

/** `drawn`: a game is being drawn. `set`: its game is set, „wird gespielt“ (0.8 adds a result). A put-back Round has no state: it is gone. */
export type RoundState = 'drawn' | 'set'

export function roundState(round: Pick<RoundFacts, 'setAt'>): RoundState {
  return round.setAt === null ? 'drawn' : 'set'
}

/** Whether the Round stands: the Host has not put it back. */
function stands<R extends Pick<RoundFacts, 'putBackAt'>>(round: R): boolean {
  return round.putBackAt === null
}

/** Whether the Round is open (waits for its result): its game is set and it was not put back. */
export function isOpen(round: RoundFacts): boolean {
  return stands(round) && roundState(round) === 'set'
}

/** How many Rounds have started: every Round the Host has not put back, being drawn or set. The Game count never drops below it. */
export function roundsStarted(rounds: readonly Pick<RoundFacts, 'putBackAt'>[]): number {
  return rounds.filter(stands).length
}

/**
 * The games left in the Game pool (spec #218 § Drawing): the pool minus every game drawn or set in this Event, played,
 * vetoed or open, in the pool's order. Only one thing returns a game: the Host putting back the Round it was set in, and
 * only a game that came from the pool (a library game was never in it). A vetoed game never comes back.
 */
export function gamesLeft(pool: readonly string[], draws: readonly DrawFacts[], rounds: readonly RoundFacts[]): string[] {
  const putBack = new Set(rounds.filter(round => !stands(round)).map(round => round.id))
  const returned = (draw: DrawFacts) => putBack.has(draw.roundId) && draw.outcome === 'set' && draw.source === 'pool'
  const gone = new Set(draws.filter(draw => !returned(draw)).map(draw => draw.gameId))
  return pool.filter(id => !gone.has(id))
}

/** Why the Host cannot set the next game now, in the order they are checked. */
export type SetRejection = 'not_host' | 'not_set_up' | 'no_running_session' | TeamsRejection | 'game_count_reached' | 'round_being_drawn'

export interface SetInput {
  isHost: boolean
  /** The settings that matter here; null for an Event that is not set up. */
  settings: Pick<EventSettings, 'teamCount' | 'gameCount'> | null
  sessions: readonly SessionTimes[]
  seats: Seats
  rounds: readonly RoundFacts[]
}

/**
 * The reason the next game cannot be set now, or null when it can (#228): the Host asks, a Session is running, the
 * teams are equally big (the rule that starts a Session, teamsRejection), the Event has not started as many Rounds as its
 * Game count, and no Round is being drawn. Spinning (0.7-04) follows the same rule and adds an empty pool.
 */
export function setRejection({ isHost, settings, sessions, seats, rounds }: SetInput): SetRejection | null {
  if (!isHost) return 'not_host'
  if (!runningOf(sessions)) return 'no_running_session'
  if (settings === null) return 'not_set_up'
  const teams = teamsRejection(settings.teamCount, seats)
  if (teams) return teams
  if (roundsStarted(rounds) >= settings.gameCount) return 'game_count_reached'
  return rounds.some(round => stands(round) && roundState(round) === 'drawn') ? 'round_being_drawn' : null
}
