// The Event's Rounds (GLOSSARY: Round, Game pool, Game count; spec #218 § Rounds, #228). Pure, so the server enforces the
// rules and the client shows the same facts: which games are left in the Game pool, which Rounds are open, how many have
// started (the Game count's floor) and why the Host cannot set the next game now. The Worker does not import this file.
// The spin (#229) and the Veto window (#231) are more arms of a Round's draws.

import type { Seats } from './board'
import { runningOf, teamsRejection, type Instant, type SessionTimes, type TeamsRejection } from './session-state'
import { hasWheel, type EventSettings } from './settings'

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

/**
 * Whether a game is being drawn in the Round: it stands, has no game, and one of its draws is open (not settled yet: the wheel
 * spins, or its Veto window runs). Setting or spinning is refused meanwhile (`round_being_drawn`).
 */
export function isBeingDrawn(round: Pick<RoundFacts, 'id' | 'setAt' | 'putBackAt'>, draws: readonly Pick<DrawFacts, 'roundId' | 'outcome'>[]): boolean {
  return stands(round) && round.setAt === null && draws.some(draw => draw.roundId === round.id && draw.outcome === null)
}

/**
 * Whether the Round waits for a respin (#231, spec #218 § Vetoes): it stands, has no game, and all its draws are settled
 * `vetoed`. The next spin or set goes into this Round instead of starting one, and it counts once toward the Game count.
 */
export function waitsForRespin(round: Pick<RoundFacts, 'id' | 'setAt' | 'putBackAt'>, draws: readonly Pick<DrawFacts, 'roundId' | 'outcome'>[]): boolean {
  if (!stands(round) || round.setAt !== null) return false
  const own = draws.filter(draw => draw.roundId === round.id)
  return own.length > 0 && own.every(draw => draw.outcome === 'vetoed')
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
  /** The Event's draws (only their Round and outcome matter): a Round is being drawn or waits for a respin by them. */
  draws: readonly Pick<DrawFacts, 'roundId' | 'outcome'>[]
}

/**
 * The reason the next game cannot be set now, or null when it can (#228): the Host asks, a Session is running, the
 * teams are equally big (the rule that starts a Session, teamsRejection), the Event has not started as many Rounds as its
 * Game count (a Round waiting for a respin takes the draw, #231), and no Round is being drawn. Spinning (0.7-04) follows the same rule and adds an empty pool.
 */
export function setRejection({ isHost, settings, sessions, seats, rounds, draws }: SetInput): SetRejection | null {
  if (!isHost) return 'not_host'
  if (!runningOf(sessions)) return 'no_running_session'
  if (settings === null) return 'not_set_up'
  const teams = teamsRejection(settings.teamCount, seats)
  if (teams) return teams
  // A Round that waits for a respin takes the next draw itself, so the Game count does not stand in its way (#231).
  if (roundsStarted(rounds) >= settings.gameCount && !rounds.some(round => waitsForRespin(round, draws))) return 'game_count_reached'
  return rounds.some(round => isBeingDrawn(round, draws)) ? 'round_being_drawn' : null
}

/** The spin starts this long after the commit, so every client has the message and starts together (#229, spec #218 § Drawing). */
export const SPIN_LEAD_MS = 1500
/** How long the wheel spins (04-motion § Lucky Wheel: 3 to 10 s); there is no setting for it. The stop is the start plus this. */
export const SPIN_DURATION_MS = 6000
/** A reduced-motion client spins this long, ending at the same stop instant. */
export const SPIN_REDUCED_MS = 1200

/** Why the Host cannot spin now: the reasons of setting a game, plus a Selection mode without a wheel and an empty pool. */
export type SpinRejection = SetRejection | 'no_wheel' | 'pool_empty'

export interface SpinInput extends Omit<SetInput, 'settings'> {
  /** The settings that matter here; null for an Event that is not set up. */
  settings: Pick<EventSettings, 'teamCount' | 'gameCount' | 'selectionMode'> | null
  /** The games left in the Game pool (gamesLeft). */
  left: readonly string[]
}

/** The reason the wheel cannot be spun now, or null (#229): setRejection's reasons in their order, then no wheel, then no game left. */
export function spinRejection({ left, ...input }: SpinInput): SpinRejection | null {
  const rejection = setRejection(input)
  if (rejection) return rejection
  if (!hasWheel(input.settings!.selectionMode)) return 'no_wheel'
  return left.length === 0 ? 'pool_empty' : null
}

/** The Veto window: every Party with a Veto left has this long after the wheel's stop to reject the game (#231, spec #218 § Vetoes). */
export const VETO_WINDOW_MS = 60_000

/** What a Party's Vetoes left are counted from (#231): the Veto allowance, the Bonus Vetoes granted and the Vetoes cast, as the team numbers they belong to. */
export interface VetoLedger {
  /** The Veto allowance per Party; null (Host pick) has none. */
  allowance: number | null
  teamCount: number
  /** One entry per Bonus Veto: the team it was granted to. */
  bonusTeams: readonly number[]
  /** One entry per Veto cast in the Event, settled or not, in a put-back Round too: the team that cast it. Spent stays spent. */
  castTeams: readonly number[]
}

/** Each Party's Vetoes left (index 0 = team 1): allowance + Bonus Vetoes - Vetoes cast, never below 0. */
export function vetoesLeftByParty({ allowance, teamCount, bonusTeams, castTeams }: VetoLedger): number[] {
  const count = (teams: readonly number[], team: number) => teams.filter(entry => entry === team).length
  return Array.from({ length: teamCount }, (_, index) => {
    const team = index + 1
    return Math.max(0, (allowance ?? 0) + count(bonusTeams, team) - count(castTeams, team))
  })
}

/** Whether a draw opens a Veto window: some Party has at least one Veto left. Decided at the draw's commit. */
export function opensWindow(left: readonly number[]): boolean {
  return left.some(vetoes => vetoes >= 1)
}

/** How a draw with a Veto window ends: any Veto rejects the game, none lets it stand. */
export function drawOutcome(vetoCount: number): DrawOutcome {
  return vetoCount > 0 ? 'vetoed' : 'set'
}

/** Why a Veto cannot be cast now, in the order they are checked. */
export type VetoRejection = 'not_a_player' | 'no_veto_window' | 'veto_window_closed' | 'veto_already_cast' | 'no_vetoes_left'

export interface VetoInput {
  /** The viewer's Party; null for the Bench, the Stands and a viewer without a Member. */
  viewerTeam: number | null
  /** The draw the Veto is for; null when the Event has none by that id. */
  draw: { stopAt: Instant, vetoEndsAt: Instant | null, outcome: DrawOutcome | null } | null
  now: Instant
  /** The teams that cast a Veto on this draw. */
  castTeams: readonly number[]
  /** The viewer's Party's Vetoes left (vetoesLeftByParty). */
  left: number
}

/**
 * The reason the viewer cannot cast a Veto on the draw now, or null (#231): they are no Player, the draw has no window (or is
 * unknown), the window is closed (from its end on, before the stop, or the draw settled), their Party cast on this draw already,
 * or their Party has no Veto left.
 */
export function vetoRejection({ viewerTeam, draw, now, castTeams, left }: VetoInput): VetoRejection | null {
  if (viewerTeam === null) return 'not_a_player'
  if (draw === null || draw.vetoEndsAt === null) return 'no_veto_window'
  const at = new Date(now).getTime()
  if (draw.outcome !== null || at >= new Date(draw.vetoEndsAt).getTime() || at < new Date(draw.stopAt).getTime()) return 'veto_window_closed'
  if (castTeams.includes(viewerTeam)) return 'veto_already_cast'
  return left < 1 ? 'no_vetoes_left' : null
}
