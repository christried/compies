// The Result of a Round (GLOSSARY: Result, Place, Shared place, Points table, Score; spec #272, #273). Pure, so the result sheet and
// the server's parser and rules agree: the shape of the Places, the Score's cap, the points a Place earns, the order the sheet makes,
// the next Round number, and the reason a Result cannot be entered now. The Worker does not import this file.

import { characterCount } from './text'
import type { Phase } from './event'
import type { PointsTable } from './settings'
import { isOpen, type RoundFacts } from './rounds'
import type { StandingView } from './stage'

/** The longest Score: 7 characters as the User sees them (graphemes, the rule of #76). */
export const SCORE_MAX = 7

/** One Party's line in a Result: its team position, its Place, its Score (null = none; else trimmed, 1 to SCORE_MAX graphemes). */
export interface ResultPlace { team: number, place: number, score: string | null }

/** A typed Score as stored: trimmed, and empty means none. */
export function normalizeScore(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/** Whether a stored Score is valid: null, or trimmed, not empty and at most SCORE_MAX graphemes. */
export function scoreValid(score: string | null): boolean {
  if (score === null) return true
  return score === score.trim() && score !== '' && characterCount(score) <= SCORE_MAX
}

/**
 * Whether the Places are a Result for `teamCount` Parties: every team 1..teamCount exactly once (whole numbers), and, sorted by Place,
 * the first Place is 1 and each next Place equals the one before (a Shared place) or its position in the sorted list:
 * 1,1,3 and 1,2,2 are valid; 1,1,2, 2,2,3 and 1,3,3 are not. Every Score passes scoreValid. The order of the array does not matter.
 */
export function resultShapeValid(places: readonly ResultPlace[], teamCount: number): boolean {
  if (places.length !== teamCount) return false
  const teams = new Set(places.map(entry => entry.team))
  if (teams.size !== teamCount) return false
  for (let team = 1; team <= teamCount; team++) if (!teams.has(team)) return false
  if (places.some(entry => !Number.isInteger(entry.team) || !Number.isInteger(entry.place) || !scoreValid(entry.score))) return false

  const sorted = [...places].sort((a, b) => a.place - b.place)
  return sorted.every((entry, index) => {
    if (index === 0) return entry.place === 1
    const above = sorted[index - 1]!.place
    return entry.place === above || entry.place === index + 1
  })
}

/** The points a Place earns: the Points table's value for that Place (a Shared place earns the better Place's by construction). 0 beyond the table. */
export function pointsForPlace(place: number, table: Pick<PointsTable, 'values'>): number {
  return table.values[place - 1] ?? 0
}

/** Each Party's points for a Result, index 0 = team 1. */
export function partyPoints(places: readonly Pick<ResultPlace, 'team' | 'place'>[], table: Pick<PointsTable, 'values'>): number[] {
  const points = Array.from({ length: places.length }, () => 0)
  for (const entry of places) points[entry.team - 1] = pointsForPlace(entry.place, table)
  return points
}

/**
 * The Places for the rows of the sheet, top to bottom: `order` are the team positions, `level[i]` (i >= 1) says row i shares the
 * Place of row i-1 (`level[0]` is ignored). Place of row i = the Place of row i-1 when level, else i + 1. [3,1,2] with level [_, true, false] -> 3:1, 1:1, 2:3.
 */
export function placesFromOrder(order: readonly number[], level: readonly boolean[]): { team: number, place: number }[] {
  const places: { team: number, place: number }[] = []
  order.forEach((team, index) => {
    const place = index > 0 && level[index] ? places[index - 1]!.place : index + 1
    places.push({ team, place })
  })
  return places
}

/**
 * Each Party's points over all Results, index 0 = team 1: the sum of the points of its Place in every Result. A Place of a team beyond `teamCount` counts for nobody.
 */
export function totalPoints(results: readonly (readonly Pick<ResultPlace, 'team' | 'place'>[])[], table: Pick<PointsTable, 'values'>, teamCount: number): number[] {
  const points = Array.from({ length: teamCount }, () => 0)
  for (const places of results) {
    for (const entry of places) {
      if (entry.team >= 1 && entry.team <= teamCount) points[entry.team - 1]! += pointsForPlace(entry.place, table)
    }
  }
  return points
}

/**
 * The Standings (GLOSSARY: Standings) from every Party's points (index 0 = team 1): the rank is 1 + the number of Parties with MORE points
 * (so equal points share a rank, and the next rank is skipped: 1, 1, 3), and the rows are sorted by points descending, then team ascending.
 * Nothing else orders them. The input is not changed.
 */
export function standingsOf(points: readonly number[]): StandingView[] {
  return points
    .map((value, index) => ({ team: index + 1, points: value }))
    .sort((a, b) => b.points - a.points || a.team - b.team)
    .map(row => ({ team: row.team, rank: 1 + points.filter(value => value > row.points).length, points: row.points }))
}

/** The team positions on Place 1, ascending (the feed's `first`). */
export function winnersOf(places: readonly Pick<ResultPlace, 'team' | 'place'>[]): number[] {
  return places.filter(entry => entry.place === 1).map(entry => entry.team).sort((a, b) => a - b)
}

/** The next Round number: the highest in the Event + 1; 1 when no Round has one. `null` entries are Rounds without a Result. */
export function nextRoundNumber(numbers: readonly (number | null)[]): number {
  return numbers.reduce<number>((highest, number) => (number === null ? highest : Math.max(highest, number)), 0) + 1
}

/** Why a Result cannot be entered now (#273), in the order they are checked. */
export type ResultRejection = 'not_host' | 'not_set_up' | 'wrong_phase' | 'round_not_found' | 'round_not_open' | 'invalid_result'

export interface ResultInput {
  isHost: boolean
  /** The settings that matter here; null for an Event that is not set up. */
  settings: { teamCount: number } | null
  phase: Phase
  /** The Round the id names among the Event's Rounds (put-back ones too); null when there is none. */
  round: Pick<RoundFacts, 'setAt' | 'putBackAt' | 'resultAt'> | null
  /** The Places as the parser read them; null when the body was not a list of Places. */
  places: readonly ResultPlace[] | null
}

/**
 * The reason a Result cannot be entered now, or null (#273), in the order they are checked: the Host asks, the Event is set up, its
 * Phase is `running`, the Round exists, it is open (isOpen: set, not put back, no Result yet: a Round being drawn, waiting for a
 * respin, put back or with a Result is `round_not_open`), and the Places are a valid Result (resultShapeValid).
 */
export function resultRejection({ isHost, settings, phase, round, places }: ResultInput): ResultRejection | null {
  if (!isHost) return 'not_host'
  if (settings === null) return 'not_set_up'
  if (phase !== 'running') return 'wrong_phase'
  if (round === null) return 'round_not_found'
  // #275: a Round that already has a Result is refused here; the Correction replaces this refusal.
  if (!isOpen(round)) return 'round_not_open'
  if (places === null || !resultShapeValid(places, settings.teamCount)) return 'invalid_result'
  return null
}
