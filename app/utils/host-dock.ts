import type { StartRejection } from '~~/shared/board'
import type { EventView } from '~~/shared/event'
import { pollingNumber } from './event-page'

// The state of the Host dock (#164, 11-event-seite § HostDock): which primary action the Event offers now, from the
// Event read. One place decides it, so the dock, its tests and the page agree. „Event beenden“ is not here: finishing
// an Event is 1.6, so after the last Session ended the dock has no primary.

export type DockInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates' | 'runningSessionId' | 'start'>

export interface HostDockState {
  /** `setup`: no settings. `poll`: no Session is dated, none started. `teams`: a Session is dated, none started. `running`: a Session runs. `between`: a Session ended, none runs. `done`: every Session ended. */
  kind: 'setup' | 'poll' | 'teams' | 'running' | 'between' | 'done'
  /** The one primary action, or null when there is none (`done`). */
  primary: 'setup' | 'setDate' | 'start' | 'end' | null
  /** The shown number of the Session to start or end; null for the only Session of an Event, or without one. */
  number: number | null
  /** The shown number a Session that still polls will have (after the dated ones); null when none polls or the Event has one Session. */
  pollNumber: number | null
  /** Why the next Session cannot start now, or null when it can (or when there is none to start). */
  startRejection: StartRejection | null
}

/** The dock's state for the Host. */
export function hostDockState({ settings, sessions, missingDates, runningSessionId, start }: DockInput): HostDockState {
  const pollNumber = pollingNumber(sessions, missingDates)
  const base = { number: null, pollNumber, startRejection: null }
  if (settings === null) return { ...base, kind: 'setup', primary: 'setup' }

  if (runningSessionId !== null) {
    return { ...base, kind: 'running', primary: 'end', number: sessions.find(session => session.id === runningSessionId)?.number ?? null }
  }

  const next = start?.sessionId ?? null
  const started = sessions.some(session => session.startedAt !== null)
  const startable = { ...base, primary: 'start' as const, number: start?.number ?? null, startRejection: start?.rejection ?? null }
  if (!started) return next === null ? { ...base, kind: 'poll', primary: 'setDate' } : { ...startable, kind: 'teams' }
  if (next !== null) return { ...startable, kind: 'between' }
  // Every dated Session has started: a Session that still polls gets its Date next, else the Event waits for 1.6.
  return missingDates > 0 ? { ...base, kind: 'between', primary: 'setDate' } : { ...base, kind: 'done', primary: null }
}
