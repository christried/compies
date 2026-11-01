// A Session's state (GLOSSARY: Session, Running Session; spec #153 § Game board rules module, #164; review 1.4 A1, S3, S6;
// #226). One home of "undated, set, running, ended", of "has started" and "is running", and of the start rule that
// follows from them. Pure, so the server enforces them and the client shows the same state. The Worker does not import
// this file (it needs only the `Place` of shared/board.ts), so a change here does not redeploy it. A running Session holds
// the Event's Rounds from 0.7-03 (#228); their rules are shared/rounds.ts, which asks this module for the Running Session
// and for the equal-teams rule (`teamsRejection`) that starting a Session uses too.

import type { BoardSettings, Seats } from './board'

/** A point in time as the layers hold it: ms since the epoch, a `Date` (database rows) or an ISO string (the Event read). */
export type Instant = number | Date | string

/** The times that decide a Session's state; null while it has none. Rows and the Event read's views both satisfy it. */
export interface SessionTimes { startsAt: Instant | null, startedAt: Instant | null, endedAt: Instant | null }

/** `undated`: no Date yet. `set`: it has its Date. `running`: the Host started it. `ended`: the Host ended it. */
export type SessionState = 'undated' | 'set' | 'running' | 'ended'

const msOf = (at: Instant): number => (typeof at === 'number' ? at : new Date(at).getTime())

/** Whether the Host has started the Session (#164), also one that has ended. The one home of that test. */
export function isStarted<S extends { startedAt: Instant | null }>(session: S): session is S & { startedAt: Instant } {
  return session.startedAt !== null
}

/** Whether the Session is the Running Session (#164): started and not ended. The one home of that test. */
export function isRunning<S extends { startedAt: Instant | null, endedAt: Instant | null }>(session: S): session is S & { startedAt: Instant } {
  return isStarted(session) && session.endedAt === null
}

/** The state of a Session (undated -> set -> running -> ended). */
export function sessionState(session: SessionTimes): SessionState {
  if (isRunning(session)) return 'running'
  if (isStarted(session)) return 'ended'
  return session.startsAt === null ? 'undated' : 'set'
}

/**
 * Whether any Session has started (#164), also one that has ended: from then on the teams and the settings that stay
 * fixed are locked. The one home of that filter, for the server's rows and the client's Event read alike.
 * `settingsLocked(phase)` (shared/settings.ts) is the same fact read from the Phase, which the first start sets.
 */
export function hasStarted(sessions: readonly { startedAt: Instant | null }[]): boolean {
  return sessions.some(isStarted)
}

/** The Running Session (#164), or undefined. At most one per Event. */
export function runningOf<S extends { startedAt: Instant | null, endedAt: Instant | null }>(sessions: readonly S[]): (S & { startedAt: Instant }) | undefined {
  return sessions.find(isRunning)
}

/**
 * The next Session (#164): the earliest dated Session that has not started, by its Date, or null. No time check: a
 * future Date can start early. Rows and the Event read's Sessions both take it.
 */
export function nextSession<S extends { startsAt: Instant | null, startedAt: Instant | null }>(sessions: readonly S[]): (S & { startsAt: Instant }) | null {
  let next: (S & { startsAt: Instant }) | null = null
  for (const session of sessions) {
    if (session.startsAt === null || isStarted(session)) continue
    if (next === null || msOf(session.startsAt) < msOf(next.startsAt)) next = session as S & { startsAt: Instant }
  }
  return next
}

/** Why the teams cannot play now: one has no Player, or they differ in size. */
export type TeamsRejection = 'teams_empty' | 'teams_uneven'

/**
 * The one equal-teams rule (spec #218 § Rounds): every team has a Player and the teams are equally big. Starting a Session
 * and setting or spinning a game (#228) both ask here; `seats` counts the Players per team.
 */
export function teamsRejection(teamCount: number, seats: Seats): TeamsRejection | null {
  const sizes = Array.from({ length: teamCount }, (_, index) => seats[index + 1] ?? 0)
  if (sizes.some(size => size === 0)) return 'teams_empty'
  return sizes.every(size => size === sizes[0]) ? null : 'teams_uneven'
}

/** Why a Session cannot start now (spec #153 § Game board rules module), in the order they are checked. */
export type StartRejection = 'not_set_up' | 'session_running' | 'no_dated_session' | TeamsRejection

export interface StartInput { settings: BoardSettings | null, sessions: readonly SessionTimes[], seats: Seats }

/**
 * The reason the next Session cannot start, or null when it may (#164): the Event is set up (it has
 * settings: the one home of that rule), no Session is running, a dated Session is left to start, every team has a Player and the teams are equally big.
 */
export function startRejection({ settings, sessions, seats }: StartInput): StartRejection | null {
  if (settings === null) return 'not_set_up'
  if (runningOf(sessions)) return 'session_running'
  if (nextSession(sessions) === null) return 'no_dated_session'
  return teamsRejection(settings.teamCount, seats)
}
