import type { EventView, SessionView } from '~~/shared/event'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the order of the blocks
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too.

export type PageInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates' | 'runningSessionId'>

export interface EventPageState {
  /** `setup`: no settings. `poll`: no Session is dated. `teams`: a Session is dated, none started. `running`: a Session runs. `between`: a Session ended, more are to come. `done`: every Session ended. */
  kind: 'setup' | 'poll' | 'teams' | 'running' | 'between' | 'done'
  /** How many Sessions the Event has. */
  total: number
  /** The next Session to start (the earliest dated one that has not started): its shown number (null for an only Session) and Date. */
  next: { number: number | null, startsAt: string } | null
  /** The Running Session: its shown number and when it started. */
  running: { number: number | null, startedAt: string } | null
  /** The Session that ended last: its shown number. */
  lastEnded: { number: number | null } | null
  /** The shown number a Session that still polls will have (after the dated ones); null when none polls or the Event has one Session. */
  pollNumber: number | null
}

/** The shown number a Session that still polls will have: after the dated ones. null when none polls, or the Event has one Session. */
export function pollingNumber(sessions: Pick<SessionView, 'startsAt'>[], missingDates: number): number | null {
  return missingDates > 0 && sessions.length > 1 ? sessions.filter(session => session.startsAt !== null).length + 1 : null
}

export function eventPageState({ settings, sessions, missingDates, runningSessionId }: PageInput): EventPageState {
  const waiting = sessions
    .filter((session): session is typeof session & { startsAt: string } => session.startsAt !== null && session.startedAt === null)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]
  const runningSession = sessions.find(session => session.id === runningSessionId)
  const ended = sessions
    .filter(session => session.endedAt !== null)
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!))[0]
  const started = sessions.some(session => session.startedAt !== null)

  const base = {
    total: sessions.length,
    next: waiting ? { number: waiting.number, startsAt: waiting.startsAt } : null,
    running: runningSession?.startedAt ? { number: runningSession.number, startedAt: runningSession.startedAt } : null,
    lastEnded: ended ? { number: ended.number } : null,
    pollNumber: pollingNumber(sessions, missingDates),
  }
  if (settings === null) return { ...base, kind: 'setup' }
  if (runningSessionId !== null) return { ...base, kind: 'running' }
  if (!started) return { ...base, kind: waiting ? 'teams' : 'poll' }
  return { ...base, kind: waiting || missingDates > 0 ? 'between' : 'done' }
}
