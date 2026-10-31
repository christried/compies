import type { StartRejection } from '~~/shared/board'
import type { EventView } from '~~/shared/event'
import { eventPageState, type EventPageState } from './event-page'

// The state of the Host dock (#164, 11-event-seite § HostDock): which primary action the Event offers now, from the
// Event read. It is the Event page's own state (eventPageState: one place decides what the Event is doing) plus the
// Host's start rule, so the dock, its tests and the page agree. „Event beenden“ is not here: finishing an Event is 1.6,
// so after the last Session ended the dock has no primary.

export type DockInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates' | 'runningSessionId' | 'start'>

export interface HostDockState {
  /** The page's `kind`: `setup`, `poll`, `teams`, `running`, `between` or `done`. */
  kind: EventPageState['kind']
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
export function hostDockState(input: DockInput): HostDockState {
  const page = eventPageState(input)
  const base = { kind: page.kind, number: null, pollNumber: page.pollNumber, startRejection: null }
  switch (page.kind) {
    case 'setup': return { ...base, primary: 'setup' }
    case 'poll': return { ...base, primary: 'setDate' }
    case 'running': return { ...base, primary: 'end', number: page.running?.number ?? null }
    case 'done': return { ...base, primary: null }
    // `teams` and `between`: a dated Session is left to start, with the Host's start rule on it; a `between` with none left
    // has a Session that still polls, which gets its Date next.
    default: return page.next === null
      ? { ...base, primary: 'setDate' }
      : { ...base, primary: 'start', number: input.start?.number ?? null, startRejection: input.start?.rejection ?? null }
  }
}
