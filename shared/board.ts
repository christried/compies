// The Game board rules (GLOSSARY: Game board, Team choice, Bench, Stands; spec #153 § Game board rules module, #160).
// Pure, so the server enforces them and the board's MoveToMenu shows the same reasons. The Worker reaches this file
// through shared/realtime.ts (the `Place` in `member.moved`), so it imports nothing outside shared/.

import type { EventSettings } from './settings'

/** Where a Member stands on the Game board: the Bench, the Stands (Tribüne) or a team by its position (1..team count). */
export type Place = { zone: 'bench' | 'stands' } | { zone: 'team', team: number }

/** Why a move is refused. `teams_locked` needs `started`, which #164 sets once the first Session has started. */
export type MoveRejection = 'host_only' | 'already_there' | 'no_such_team' | 'team_choice_closed' | 'teams_locked' | 'team_full'

/** Players per team position (missing = nobody). */
export type Seats = Readonly<Record<number, number>>

/**
 * Whether Players may move into and out of teams on their own (Team choice): the Event is set up, a Session has a
 * Date, and the first Session has not started. Reopening the only Date closes it again, and moves nobody (moveRejection
 * only gates moves).
 */
export function teamChoiceOpen({ settings, hasDatedSession, started }: { settings: EventSettings | null, hasDatedSession: boolean, started: boolean }): boolean {
  return settings !== null && hasDatedSession && !started
}

export interface MoveCheck {
  actorId: string
  actorIsHost: boolean
  /** The Member who moves. */
  userId: string
  from: Place
  to: Place
  settings: EventSettings | null
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

/** The Player count of the fullest team (0 without Players in teams): the lowest Team size the settings may take. */
export function fullestTeam(seats: Seats): number {
  return Math.max(0, ...Object.values(seats))
}
