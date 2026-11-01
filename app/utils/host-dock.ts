import { hasWheel } from '~~/shared/settings'
import type { SetRejection, SpinRejection } from '~~/shared/rounds'
import type { StartRejection } from '~~/shared/session-state'
import type { EventView } from '~~/shared/event'
import { eventPageState, type EventPageState } from './event-page'

// The state of the Host dock (#164, 11-event-seite § HostDock): which primary action the Event offers now, from the
// Event read. It is the Event page's own state (eventPageState: one place decides what the Event is doing) plus the
// Host's start rule, so the dock, its tests and the page agree. „Event beenden“ is not here: finishing an Event is 1.6,
// so after the last Session ended the dock has no primary. In a running Session „Nächstes Spiel setzen“ is the primary of
// Host pick; in the Lucky Wheel „Rad drehen“ is (#229), disabled with its reason, and „Nächstes Spiel setzen“ waits in „Mehr“.

export type DockInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates' | 'start' | 'setGame'> & { event: Pick<EventView['event'], 'phase'> }

export interface HostDockState {
  /** The page's `kind`: `setup`, `poll`, `teams`, `running`, `between` or `done`. */
  kind: EventPageState['kind']
  /** The one primary action, or null when there is none (`done`). */
  primary: 'setup' | 'setDate' | 'start' | 'end' | 'setGame' | 'spin' | null
  /** The shown number of the Session to start or end; null for the only Session of an Event, or without one. */
  number: number | null
  /** The shown number a Session that still polls will have (after the dated ones); null when none polls or the Event has one Session. */
  pollNumber: number | null
  /** Why the next Session cannot start now, or null when it can (or when there is none to start). */
  startRejection: StartRejection | null
  /** Why the next game cannot be set now, or null when it can (or when no Session runs). */
  setRejection: SetRejection | null
  /** Why the wheel cannot be spun now, or null when it can (or when the Event has no wheel). */
  spinRejection: SpinRejection | null
}

/** The dock's state for the Host. */
export function hostDockState(input: DockInput): HostDockState {
  const page = eventPageState(input)
  const base = { kind: page.kind, number: null, pollNumber: page.pollNumber, startRejection: null, setRejection: null, spinRejection: null }
  switch (page.kind) {
    case 'setup': return { ...base, primary: 'setup' }
    case 'poll': return { ...base, primary: 'setDate' }
    case 'running': {
      const wheel = input.settings !== null && hasWheel(input.settings.selectionMode)
      return {
        ...base,
        primary: wheel ? 'spin' : 'setGame',
        number: page.running.number,
        setRejection: input.setGame?.rejection ?? null,
        spinRejection: wheel ? input.setGame?.spinRejection ?? null : null,
      }
    }
    case 'done': return { ...base, primary: null }
    // `teams` and `between`: a dated Session is left to start, with the Host's start rule on it; a `between` with none left
    // has a Session that still polls, which gets its Date next.
    default: return page.next === null
      ? { ...base, primary: 'setDate' }
      : { ...base, primary: 'start', number: input.start?.number ?? null, startRejection: input.start?.rejection ?? null }
  }
}

/** The actions the dock can hold, by key. */
export type DockKey = 'settings' | 'invite' | 'slots' | 'setDate' | 'start' | 'end' | 'setGame' | 'spin'

/**
 * Which actions the dock holds per state, in named parts (review 1.4 A4, #228): the `primary` action(s), the `secondary` ones
 * that sit in the dock next to them, and `more`, which waits behind „Mehr“. The dock lists them in this order. A new action
 * is one key here and one entry in `useHostActions`.
 */
export interface DockLayout { primary: DockKey[], secondary: DockKey[], more: DockKey[] }

/** The dock's layout for a state. `pollOpen`: the Date poll is open, so the Dates can be set and the Slots edited. */
export function dockLayout(state: HostDockState, pollOpen: boolean): DockLayout {
  const dates: DockKey[] = pollOpen ? ['setDate'] : []
  const slots: DockKey[] = pollOpen ? ['slots'] : []
  if (state.kind === 'setup') return { primary: ['settings'], secondary: ['invite'], more: [...dates, ...slots] }
  switch (state.primary) {
    case 'start': return { primary: ['start'], secondary: [...dates, 'invite'], more: [...slots, 'settings'] }
    case 'setGame': return { primary: ['setGame'], secondary: ['end', 'invite'], more: [...dates, ...slots, 'settings'] }
    case 'spin': return { primary: ['spin'], secondary: ['end', 'invite'], more: ['setGame', ...dates, ...slots, 'settings'] }
    case 'end': return { primary: ['end'], secondary: ['invite'], more: ['setGame', ...dates, ...slots, 'settings'] }
    case 'setDate': return { primary: dates, secondary: ['invite'], more: [...slots, 'settings'] }
    default: return { primary: [], secondary: ['invite'], more: ['settings'] }
  }
}

/** The i18n key of the reason a game cannot be set or the wheel not spun now: the start rule's words for the teams, the dock's own for the rest. */
export function setBlockedKey(rejection: SpinRejection): string {
  switch (rejection) {
    case 'not_set_up':
    case 'teams_empty':
    case 'teams_uneven': return `dock.startBlocked.${rejection}`
    default: return `dock.setBlocked.${rejection}`
  }
}
