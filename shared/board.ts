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

/** Why a move is refused. `teams_locked` needs `started`: the first Session has started (#164). */
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
 * The Team name (GLOSSARY: Team name, #161, #164). `frozen` undefined means the team is not frozen: the name is
 * composed from its words in the order given (teamWords), joined by a space. From the first Session start `frozen` is
 * what `event_teams.frozen_name` holds: the string, or null for the Team colour's name, which stays null even when
 * words exist (the Host reset it). Null means the client shows the Team colour's name.
 */
export function composedTeamName({ frozen, words }: { frozen?: string | null, words: readonly string[] }): string | null {
  if (frozen !== undefined) return frozen
  return words.length === 0 ? null : words.join(' ')
}

/** A Member as the Team name needs them: their team position, Team word and the moment they took the seat (database columns). */
export interface TeamMember { team: number | null, teamWord: string | null, teamJoinedAt: Date | null }

/**
 * The Team name of one team from the Event's Members (composedTeamName of its words, teamWords): the Event read shows it
 * and the first start freezes it (#161, #164). `frozen` is the frozen name, or undefined while the team is not frozen.
 */
export function teamNameOf(members: readonly TeamMember[], position: number, frozen?: string | null): string | null {
  const seats = members
    .filter(member => member.team === position)
    .map(member => ({ word: member.teamWord, joinedAt: member.teamJoinedAt?.getTime() ?? 0 }))
  return composedTeamName({ frozen, words: teamWords(seats) })
}

/** The place a request names, or null when it is none: a zone, and for `team` a whole position (its range is moveRejection's). */
export function parsePlace(value: unknown): Place | null {
  if (!isRecord(value)) return null
  const { zone, team } = value
  if (zone === 'bench' || zone === 'stands') return { zone }
  if (zone === 'team' && typeof team === 'number' && Number.isInteger(team)) return { zone, team }
  return null
}

/** A Session as the start rule needs it: its Date and its start and end as ms since the epoch, null while it has none (no `Date` parsing in here). */
export interface StartSession { id: string, startsAt: number | null, startedAt: number | null, endedAt: number | null }

/** A point in time as the layers hold it: ms since the epoch, a `Date` (database rows) or an ISO string (the Event read). */
type Instant = number | Date | string

const msOf = (at: Instant): number => (typeof at === 'number' ? at : new Date(at).getTime())

/**
 * Whether any Session has started (#164), also one that has ended: from then on the teams and the settings that stay
 * fixed are locked. The one home of that filter, for the server's rows and the client's Event read alike.
 */
export function hasStarted(sessions: readonly { startedAt: unknown }[]): boolean {
  return sessions.some(session => session.startedAt !== null)
}

/** Whether the Session is the Running Session (#164): started and not ended. */
export function isRunning(session: { startedAt: unknown, endedAt: unknown }): boolean {
  return session.startedAt !== null && session.endedAt === null
}

/** The Running Session (#164), or undefined. At most one per Event. */
export function runningOf<S extends { startedAt: unknown, endedAt: unknown }>(sessions: readonly S[]): S | undefined {
  return sessions.find(isRunning)
}

/**
 * The next Session (#164): the earliest dated Session that has not started, by its Date, or null. No time check: a
 * future Date can start early. Rows, the Event read's Sessions and the start rule's StartSessions all take it.
 */
export function nextSession<S extends { startsAt: Instant | null, startedAt: unknown }>(sessions: readonly S[]): (S & { startsAt: Instant }) | null {
  let next: (S & { startsAt: Instant }) | null = null
  for (const session of sessions) {
    if (session.startsAt === null || session.startedAt !== null) continue
    if (next === null || msOf(session.startsAt) < msOf(next.startsAt)) next = session as S & { startsAt: Instant }
  }
  return next
}

/** Why a Session cannot start now (spec #153 § Game board rules module), in the order they are checked. */
export type StartRejection = 'not_set_up' | 'session_running' | 'no_dated_session' | 'teams_empty' | 'teams_uneven'

export interface StartInput { settings: BoardSettings | null, sessions: readonly StartSession[], seats: Seats }

/**
 * The reason the next Session cannot start, or null when it may (#164): the Event is set up (it has
 * settings: the one home of that rule), no Session is running, a dated Session is left to start, every team has a Player and the teams are equally big.
 */
export function startRejection({ settings, sessions, seats }: StartInput): StartRejection | null {
  if (settings === null) return 'not_set_up'
  if (runningOf(sessions)) return 'session_running'
  if (nextSession(sessions) === null) return 'no_dated_session'
  const sizes = Array.from({ length: settings.teamCount }, (_, index) => seats[index + 1] ?? 0)
  if (sizes.some(size => size === 0)) return 'teams_empty'
  return sizes.every(size => size === sizes[0]) ? null : 'teams_uneven'
}
