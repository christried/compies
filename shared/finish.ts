// The finish and last-game rules (GLOSSARY: Finish, Tie; spec #272, #277, #278), moved out of results.ts (review 0.8 Q12): who leads, how far
// the Event is, the outcome the Standings call for, and the reasons the Host cannot finish the Event or add the last game now. Pure, so the
// dock, the routes and the Event read agree. The views (EndView) stay in stage.ts, which imports the types from here. The Worker does not import this file.

import type { Phase } from './phase'
import { pointsForPlace, standingsOf, totalPoints, type ResultPlace, type Standing } from './results'
import { GAME_COUNT_MAX, type EventSettings } from './settings'

/** The team positions on rank 1, ascending: the winner, or every Party of a Tie (#277, GLOSSARY: Tie). */
export function leadersOf(standings: readonly Standing[]): number[] {
  return standings.filter(row => row.rank === 1).map(row => row.team).sort((a, b) => a - b)
}

/**
 * The Leading Parties (#38, GLOSSARY: Leading Party): while the Event runs or is finished, and once a Result exists, the Parties on the first
 * rank (the Winners of a finished Event). Empty before the first Result and in every other Phase. The Party hat follows it (partyhat).
 */
export function leadingTeams(standings: readonly Standing[], phase: Phase, hasResults: boolean): number[] {
  if (!((phase === 'running' || phase === 'finished') && hasResults)) return []
  return leadersOf(standings)
}

/**
 * How far the Event is (#274, #277): the Rounds with a Result out of the Game count. `complete`: they reach the Game count, so the Host may
 * finish (nothing finishes by itself). `tie`: the team positions on rank 1 when `complete` and more than one holds it (GLOSSARY: Tie), else null.
 * `decided` (#953): one Party leads alone and no other Party can catch it or draw level in the Rounds left, so the Host may finish early.
 * Same for every Member; stage.ts's EndView adds the Host's part (`finish`, `lastGame`) to these.
 */
export interface EndFacts { played: number, gameCount: number, complete: boolean, tie: number[] | null, decided: boolean }

/**
 * How far the Event is (#277, GLOSSARY: Finish, Tie): `complete` when the Rounds with a Result reach the Game count (>=), `tie` the leaders
 * when complete and more than one holds rank 1, else null. `standings` are `standingsOf`'s. `swing` is the most one Round can close between two
 * Parties: the points of Place 1 minus those of the last Place. `decided` (#953): a sole leader, and every other Party's gap to it is larger than
 * the Rounds left × `swing`; an equal gap still allows a Tie, so it is not decided. A complete Event with a sole leader is decided (no Round is left).
 */
export function endOf(standings: readonly Standing[], played: number, gameCount: number, swing: number): EndFacts {
  const complete = played >= gameCount
  const leaders = leadersOf(standings)
  const catchableGap = Math.max(0, gameCount - played) * swing
  const top = standings.find(row => row.rank === 1)?.points ?? 0
  const decided = leaders.length === 1 && standings.every(row => row.rank === 1 || top - row.points > catchableGap)
  return { played, gameCount, complete, tie: complete && leaders.length > 1 ? leaders : null, decided }
}

/**
 * The Standings and the end of the Event from the Places of the Rounds with a Result, one list per Round (review 0.8, Q2): the one place that
 * composes them, so the read that the dock offers „Event abschließen“ from and the routes that refuse on the same Standings (the finish, the
 * last game) cannot drift apart.
 */
export function standingsAndEnd(groups: readonly (readonly Pick<ResultPlace, 'team' | 'place'>[])[], settings: Pick<EventSettings, 'pointsTable' | 'teamCount' | 'gameCount'>): { standings: Standing[], end: EndFacts } {
  const standings = standingsOf(totalPoints(groups, settings.pointsTable, settings.teamCount))
  // The most one Round can close (#953): Place 1's points against the last Place of the Event's Party count, from the Points table.
  const swing = pointsForPlace(1, settings.pointsTable) - pointsForPlace(settings.teamCount, settings.pointsTable)
  return { standings, end: endOf(standings, groups.length, settings.gameCount, swing) }
}

/** The outcome the Host asks the finish for (#277): a sole winner, or a Tie with all its Parties (#278 sends the second). */
export type FinishOutcome = 'winner' | 'tie'

/** The outcome the Standings call for now: 'tie' while `end.tie` is set, else 'winner'. */
export function outcomeOf(end: Pick<EndFacts, 'tie'>): FinishOutcome {
  return end.tie === null ? 'winner' : 'tie'
}

/** Why the Event cannot be finished now (#277, #953), in the order they are checked. */
export type FinishRejection = 'not_host' | 'wrong_phase' | 'results_missing' | 'round_waiting' | 'standings_changed'

/**
 * What the finish request carries (#277, review 0.8 S2): the outcome the Host held, and the Parties (team positions) he saw on Place 1,
 * `leadersOf` the Standings the dock showed. The outcome alone does not say who leads: a Correction can make another Party the sole leader.
 */
export interface FinishRequest {
  outcome: FinishOutcome
  winners: number[]
}

export interface FinishInput extends FinishRequest {
  isHost: boolean
  phase: Phase
  end: Pick<EndFacts, 'complete' | 'tie' | 'decided'>
  /** A Round waits for its Result (#953): one stands, drawn or set, without a Result. It holds back only the early Finish. */
  waiting: boolean
  /** The Standings now (standingsAndEnd's), whose leaders `winners` are compared with. */
  standings: readonly Standing[]
}

/**
 * The reason the Event cannot be finished now, or null (#277), in the order they are checked: the Host asks, the Phase is `running`, every
 * Round up to the Game count has its Result or the Event is decided (#953: `results_missing` means neither), an early Finish waits for no
 * Round's Result (`round_waiting`, #953), and what the Host saw is what the Standings say now: the same outcome (outcomeOf) and the
 * same Parties on Place 1, compared as sets. A Correction in another tab that made or ended a Tie, or changed who leads, refuses.
 */
export function finishRejection({ isHost, phase, end, waiting, standings, outcome, winners }: FinishInput): FinishRejection | null {
  if (!isHost) return 'not_host'
  if (phase !== 'running') return 'wrong_phase'
  if (!end.complete && !end.decided) return 'results_missing'
  if (!end.complete && waiting) return 'round_waiting'
  if (outcomeOf(end) !== outcome) return 'standings_changed'
  const leaders = leadersOf(standings)
  const seen = new Set(winners)
  return seen.size === leaders.length && leaders.every(team => seen.has(team)) ? null : 'standings_changed'
}

/** Why the last game cannot be added now (#278), in the order they are checked. */
export type LastGameRejection = 'not_host' | 'wrong_phase' | 'results_missing' | 'no_tie' | 'game_count_range'

export interface LastGameInput {
  isHost: boolean
  phase: Phase
  end: Pick<EndFacts, 'complete' | 'tie'>
  /** The Event's Game count now. */
  gameCount: number
}

/**
 * The reason the Host cannot add the last game now, or null (#278, GLOSSARY: Tie), in the order they are checked: the Host asks, the Phase is
 * `running`, every Round up to the Game count has its Result (a second press finds the count incomplete: `results_missing`, which the client
 * treats as done), a Tie stands, and the Game count is below GAME_COUNT_MAX (at the maximum the Host can still end „Unentschieden“). The
 * refusal `game_count_range` keeps its 400 (#278, as the settings stepper's code for the same maximum); the other four are 409.
 */
export function lastGameRejection({ isHost, phase, end, gameCount }: LastGameInput): LastGameRejection | null {
  if (!isHost) return 'not_host'
  if (phase !== 'running') return 'wrong_phase'
  if (!end.complete) return 'results_missing'
  if (end.tie === null) return 'no_tie'
  return gameCount >= GAME_COUNT_MAX ? 'game_count_range' : null
}
