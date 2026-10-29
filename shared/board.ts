// The Game board rules (GLOSSARY: Game board, Team choice, Bench, Stands; spec #153 § Game board rules module, #160).
// Pure, so the server enforces them and the board's MoveToMenu shows the same reasons. The Worker reaches this file
// through shared/realtime.ts (the `Place` in `member.moved`), so it imports nothing outside shared/.

import { isRecord } from './record'

/** What the board needs of an Event's settings (EventSettings has it). Declared here so this file imports nothing but shared/record. */
export interface BoardSettings { teamCount: number, teamSize: number }

/** Where a Member stands on the Game board: the Bench, the Stands (Tribüne) or a team by its position (1..team count). */
export type Place = { zone: 'bench' | 'stands' } | { zone: 'team', team: number }

/** The place a Member row stands for (the Event read's and the table's `zone` and `team`). `team` is set exactly when the zone is `team`. */
export function placeOf(row: { zone: 'bench' | 'stands' | 'team', team: number | null }): Place {
  return row.zone === 'team' && row.team !== null ? { zone: 'team', team: row.team } : { zone: row.zone === 'stands' ? 'stands' : 'bench' }
}

/** Why a move is refused. `teams_locked` needs `started`, which #164 sets once the first Session has started. */
export type MoveRejection = 'host_only' | 'already_there' | 'no_such_team' | 'team_choice_closed' | 'teams_locked' | 'team_full'

/** Players per team position (missing = nobody). */
export type Seats = Readonly<Record<number, number>>

/**
 * Whether Players may move into and out of teams on their own (Team choice): the Event is set up, a Session has a
 * Date, and the first Session has not started. Reopening the only Date closes it again, and moves nobody (moveRejection
 * only gates moves).
 */
export function teamChoiceOpen({ settings, hasDatedSession, started }: { settings: BoardSettings | null, hasDatedSession: boolean, started: boolean }): boolean {
  return settings !== null && hasDatedSession && !started
}

export interface MoveCheck {
  actorId: string
  actorIsHost: boolean
  /** The Member who moves. */
  userId: string
  from: Place
  to: Place
  settings: BoardSettings | null
  teamChoiceOpen: boolean
  /** The first Session has started. */
  started: boolean
  seats: Seats
}

function samePlace(a: Place, b: Place): boolean {
  return a.zone === b.zone && (a.zone !== 'team' || (b.zone === 'team' && a.team === b.team))
}

/**
 * The reason a move is refused, or null when it may happen. A Player moves only themselves, and into or out of a team
 * only while Team choice is open; Bench and Stands are always free. The Host moves anyone at any time, within the
 * Team size.
 */
export function moveRejection({ actorId, actorIsHost, userId, from, to, settings, teamChoiceOpen: choiceOpen, started, seats }: MoveCheck): MoveRejection | null {
  if (!actorIsHost && actorId !== userId) return 'host_only'
  if (samePlace(from, to)) return 'already_there'
  if (to.zone === 'team' && (settings === null || !Number.isInteger(to.team) || to.team < 1 || to.team > settings.teamCount)) return 'no_such_team'
  if (!actorIsHost && (from.zone === 'team' || to.zone === 'team')) {
    if (started) return 'teams_locked'
    if (!choiceOpen) return 'team_choice_closed'
  }
  if (to.zone === 'team' && settings !== null && (seats[to.team] ?? 0) >= settings.teamSize) return 'team_full'
  return null
}

/** The Players per team position of these places (Bench and Stands count for no team). */
export function countSeats(places: readonly Place[]): Seats {
  const seats: Record<number, number> = {}
  for (const place of places) {
    if (place.zone === 'team') seats[place.team] = (seats[place.team] ?? 0) + 1
  }
  return seats
}

/** A Player's seat in a team as the Team name needs it: their Team word (if any) and when they took the seat (ms since the epoch). */
export interface TeamSeat { word: string | null, joinedAt: number }

/** The Team words of a team's seats in the order their Players joined it (#161); Players without a word add none. */
export function teamWords(seats: readonly TeamSeat[]): string[] {
  return seats
    .filter((seat): seat is { word: string, joinedAt: number } => seat.word !== null)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(seat => seat.word)
}

/**
 * The Team name (GLOSSARY: Team name, #161): the frozen name when there is one (#164 sets it at the first Session
 * start), else the team's words in the order given (teamWords), joined by a space. Null when neither exists: the
 * client then shows the Team colour's name.
 */
export function composedTeamName({ frozen, words }: { frozen?: string | null, words: readonly string[] }): string | null {
  if (typeof frozen === 'string') return frozen
  return words.length === 0 ? null : words.join(' ')
}

/** The place a request names, or null when it is none: a zone, and for `team` a whole position (its range is moveRejection's). */
export function parsePlace(value: unknown): Place | null {
  if (!isRecord(value)) return null
  const { zone, team } = value
  if (zone === 'bench' || zone === 'stands') return { zone }
  if (zone === 'team' && typeof team === 'number' && Number.isInteger(team)) return { zone, team }
  return null
}

/** The Player count of the fullest team (0 without Players in teams): the lowest Team size the settings may take. */
export function fullestTeam(seats: Seats): number {
  return Math.max(0, ...Object.values(seats))
}
