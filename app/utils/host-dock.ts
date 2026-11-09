import { eventHasWheel } from '~~/shared/settings'
import { coinRejection } from '~~/shared/coin'
import { ceremonyRejection } from '~~/shared/ceremony'
import { errorCopyKey } from './api-error'
import type { SetRejection, SpinRejection } from '~~/shared/rounds'
import type { LastGameRejection } from '~~/shared/finish'
import type { StartRejection } from '~~/shared/session-state'
import type { EventView } from '~~/shared/event'
import { eventPageState, type EventPageState } from './event-page'

// The state of the Host dock (#164, 11-event-seite § HostDock): which primary action the Event offers now, from the
// Event read. It is the Event page's own state (eventPageState: one place decides what the Event is doing) plus the
// Host's start rule, so the dock, its tests and the page agree. Once the Rounds with a Result reach the Game count and first
// place is not shared, „Event abschließen“ is the primary in every state that plays (#277); with a Tie the primary is „Unentschieden
// beenden“ and „Letztes Spiel hinzufügen“ sits next to it (#278), and a finished Event has „Siegerehrung starten“ (#309) and „Einladen“. In a running Session „Nächstes Spiel setzen“ is the
// primary of Host pick; in the Lucky Wheel „Rad drehen“ is (#229), disabled with its reason, and „Nächstes Spiel setzen“ waits in „Mehr“.
// The end is decided once, as `closing` (#285): the kinds that play take its primary over their own, and dockLayout lays it out on top of their layout.

export type DockInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates' | 'start' | 'setGame' | 'wheel' | 'countdown' | 'coin' | 'ceremony' | 'end'> & { event: Pick<EventView['event'], 'phase'> }

export interface HostDockState {
  /** The page's `kind`: `setup`, `poll`, `teams`, `running`, `between`, `done` or `finished`. */
  kind: EventPageState['kind']
  /** The one primary action, or null when there is none (`done` while the Event cannot be finished). A closing state's primary is its `closing`. */
  primary: 'setup' | 'setDate' | 'start' | 'setGame' | 'spin' | 'finish' | 'finishTie' | 'ceremony' | null
  /** What closes the Event from here (#285): `finish` once the Game count is reached and first place is not shared, `finishTie` in a Tie, null otherwise. A finished Event's primary („Siegerehrung starten“, #309) is not one: it closes nothing. */
  closing: 'finish' | 'finishTie' | null
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
  /** Why the last game cannot be added now (#278), or null when it can (or when no Tie stands: then nothing offers it). */
  lastGameRejection: LastGameRejection | null
}

/** The dock's state for the Host. */
export function hostDockState(input: DockInput): HostDockState {
  // The dock is the Host's: the page state only needs `isHost` for the Members' Tie banner (#283), which the dock does not read.
  const page = eventPageState({ ...input, event: { ...input.event, isHost: true } })
  // The Event can be finished: the Host's rule says so (null rejection) and the first place is not shared (#277).
  const finishable = input.end?.finish?.rejection === null && input.end.tie === null
  // The Host's rule passes for the outcome the Standings call for, which is „Unentschieden“ while a Tie stands (#278). Only a Session that
  // started holds Results, so `teams` never gets here: the page's `tie` banner is listed in exactly these kinds (pageBlocks).
  const tied = input.end?.finish?.rejection === null && input.end.tie !== null
  // The one place that decides finish or tie (#285). The kinds that do not play (setup, poll, finished) carry no closing.
  const closing: HostDockState['closing'] = finishable ? 'finish' : tied ? 'finishTie' : null
  const state = unclosed(input, page)
  if (closing === null || page.kind === 'setup' || page.kind === 'poll' || page.kind === 'finished') return state
  // The kinds that play offer the closing primary instead of their own. A running Session keeps its number; the others have none to start.
  return { ...state, closing, primary: closing, number: page.kind === 'running' ? page.running.number : null, startRejection: null, setRejection: null, spinRejection: null }
}

/** The state of the page's kind as if nothing closed the Event: the Sessions and the Host's start rule decide it. */
function unclosed(input: DockInput, page: EventPageState): HostDockState {
  const base = { kind: page.kind, number: null, pollNumber: page.pollNumber, startRejection: null, setRejection: null, spinRejection: null, lastGameRejection: input.end?.lastGame?.rejection ?? null, closing: null }
  switch (page.kind) {
    case 'setup': return { ...base, primary: 'setup' }
    case 'poll': return { ...base, primary: 'setDate' }
    case 'finished': return { ...base, primary: 'ceremony' }
    case 'running': {
      const wheel = eventHasWheel(input.settings)
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
    default:
      return page.next === null
        ? { ...base, primary: 'setDate' }
        : { ...base, primary: 'start', number: input.start?.number ?? null, startRejection: input.start?.rejection ?? null }
  }
}

/** The actions the dock can hold, by key. */
export type DockKey = 'settings' | 'invite' | 'slots' | 'setDate' | 'start' | 'end' | 'setGame' | 'spin' | 'coin' | 'countdown' | 'bonusVeto' | 'finish' | 'finishTie' | 'lastGame' | 'ceremony' | 'delete'

/**
 * Which actions the dock holds per state, in named parts (review 1.4 A4, #228): the `primary` action(s), the `secondary` ones
 * that sit in the dock next to them, and `more`, which waits behind „Mehr“. The dock lists them in this order. A new action
 * is one key here and one entry in `useHostActions`.
 */
export interface DockLayout { primary: DockKey[], secondary: DockKey[], more: DockKey[] }

/**
 * The game actions of a running Session (#233, #235, #236): they sit in Mehr, before the settings, in this order. The Bonus Veto is
 * one of them only while the Host may grant it (dockLayout's `bonusVetoOpen`).
 */
export const GAME_ACTIONS: DockKey[] = ['bonusVeto', 'coin', 'countdown']

/**
 * The dock's layout for a state. `pollOpen`: the Date poll is open, so the Dates can be set and the Slots edited. `bonusVetoOpen`: the Host
 * may grant a Bonus Veto (#233: the Event has a Lucky Wheel and no reason refuses it), so the action sits in Mehr in every layout but setup.
 */
export function dockLayout(state: HostDockState, open: { pollOpen: boolean, bonusVetoOpen: boolean }): DockLayout {
  const layout = stateLayout(state, open)
  // „Event löschen“ (#333) is the last of Mehr in every state, setup and finished included, and never in the pill: one place for it.
  return { ...layout, more: [...layout.more, 'delete'] }
}

/** The layout of the state's own actions, before „Event löschen“ (#333) joins Mehr in dockLayout. */
function stateLayout(state: HostDockState, open: { pollOpen: boolean, bonusVetoOpen: boolean }): DockLayout {
  const { pollOpen, bonusVetoOpen } = open
  const dates: DockKey[] = pollOpen ? ['setDate'] : []
  const slots: DockKey[] = pollOpen ? ['slots'] : []
  const bonus: DockKey[] = bonusVetoOpen ? ['bonusVeto'] : []
  if (state.kind === 'setup') return { primary: ['settings'], secondary: ['invite'], more: [...dates, ...slots] }
  // A finished Event is read-only for good: the Host can still rotate the link (#277) and start the ceremony (#309), and nothing else remains but „Event löschen“ in Mehr (#333). HostDock lists „Einladen“ in „Mehr“ too.
  if (state.kind === 'finished') return { primary: ['ceremony'], secondary: ['invite'], more: [] }
  // The running layouts compose the game actions once (GAME_ACTIONS), in Mehr before the settings.
  const game = GAME_ACTIONS.filter(key => key !== 'bonusVeto' || bonusVetoOpen)
  // Each Session layout is spelled once, here (#285).
  const layoutOf = (primary: HostDockState['primary']): DockLayout => {
    switch (primary) {
      case 'start': return { primary: ['start'], secondary: [...dates, 'invite'], more: [...slots, ...bonus, 'settings'] }
      case 'setGame': return { primary: ['setGame'], secondary: ['end', 'invite'], more: [...dates, ...slots, ...game, 'settings'] }
      case 'spin': return { primary: ['spin'], secondary: ['end', 'invite'], more: ['setGame', ...dates, ...slots, ...game, 'settings'] }
      case 'setDate': return { primary: dates, secondary: ['invite'], more: [...slots, ...bonus, 'settings'] }
      default: return { primary: [], secondary: ['invite'], more: [...bonus, 'settings'] }
    }
  }
  if (state.closing === null) return layoutOf(state.primary)
  // A closing Event lays out its kind's own layout without the closing primary (#285): a running Session with its game set, not the spin (a
  // closing Event has no game to spin for, so Mehr keeps no „Nächstes Spiel setzen“); teams and between with the start, even when no Session is left
  // to start; done with nothing, as after the last Session no Session polls any more.
  const kindLayout = layoutOf(state.kind === 'running' ? 'setGame' : state.kind === 'done' ? null : 'start')
  // The Game count is reached: no game to set or spin, no Session to start (a Host who plays on raises the Game count first, and the start returns).
  if (state.closing === 'finish') return { ...kindLayout, primary: ['finish'] }
  // A Tie (#278): the hold, the last game next to it, and the Session's hold while one runs, so both holds are in the pill's first three. A hold never sits in Mehr
  // (HostDock lists Mehr without it). Between Sessions the Dates move to Mehr to keep the pill at three; after the last Session nothing polls.
  return {
    primary: ['finishTie'],
    secondary: ['lastGame', ...kindLayout.secondary.filter(key => key !== 'setDate')],
    more: [...kindLayout.secondary.filter(key => key === 'setDate'), ...kindLayout.more],
  }
}

/**
 * The copy key of the reason the coin cannot be tossed now, or null (#235): the dock's disabled reason while a toss flies, from the
 * Event read's toss and the server clock. The reason is the rule's (coinRejection, the Host asks here); its copy is the API's.
 */
export function coinBlockedKey({ sessions, coin }: Pick<EventView, 'sessions' | 'coin'>, nowMs: number): string | null {
  const rejection = coinRejection({ isHost: true, sessions, latest: coin, now: nowMs })
  return rejection === null ? null : errorCopyKey(rejection)
}

/**
 * The copy key of the reason the ceremony cannot start now, or null (#309): the dock's disabled reason while a run plays, from the Event read's
 * ceremony and the server clock. The reason is the rule's (ceremonyRejection, the Host asks here); its copy is the API's.
 */
export function ceremonyBlockedKey({ event, ceremony }: Pick<EventView, 'ceremony'> & { event: Pick<EventView['event'], 'phase'> }, nowMs: number): string | null {
  const rejection = ceremonyRejection({ isHost: true, phase: event.phase, latest: ceremony, now: nowMs })
  return rejection === null ? null : errorCopyKey(rejection)
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

/** The i18n key of the reason the last game cannot be added now (#278): the maximum in the dock's own words, the rest in the shared copy. */
export function lastGameBlockedKey(rejection: LastGameRejection): string {
  return rejection === 'game_count_range' ? 'dock.lastGameBlocked.game_count_range' : errorCopyKey(rejection)
}
