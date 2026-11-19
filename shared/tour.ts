import { beforeFinish, type Phase } from './phase'

// The Tour (#647, ADR 0017): steps are data, and which of them a run holds and when it starts are pure functions of that list and the page's state.

/** The Tour's current version (#646, GLOSSARY: Tour): a User's stored number says which version they last saw, 0 for never. */
export const TOUR_VERSION = 1

/** The page's calm for this long before the Tour starts (about one second, spec #622). */
export const TOUR_CALM_MS = 1000

/**
 * A version a client reports as seen: a whole number from 1 up to the current Tour, else null. Above the current
 * version only a client built for a newer Tour sends one, and its save failing means the Tour shows again (#646).
 */
export function parseTourVersion(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= TOUR_VERSION ? raw : null
}

/** What a run reads of the page it opens on. */
export interface TourPage {
  phase: Phase
  role: 'host' | 'member'
  /** The `data-tour` values of the things on the page that can be seen now. */
  present: ReadonlySet<string>
  /** From md (980 px) up: `useEventTabs`' `wide`. */
  wide: boolean
  /** `EventView.teamChoiceOpen`: the Game board's text depends on it (#648). */
  teamChoiceOpen: boolean
}

export interface TourStep {
  /** Names the step's texts: `tour.<id>.title` and `tour.<id>.text`. */
  id: string
  /** The value of the `data-tour` attribute of the thing it points at; null points at nothing. */
  target: string | null
  /** Below TOUR_NARROW_BELOW (600 px) the step points at the `data-tour` value of this child instead of `target` (#648). */
  targetNarrow?: string
  /** The value of a `data-tour-anchor` inside the thing: the tail aims at its centre. Without one, or when it is not found: the thing's centre. */
  anchor?: string
  /** A further rule beyond the target being on the page: the phone's tabs against the panel, the Game board's three texts by state (#648). */
  applies?: (page: TourPage) => boolean
  /** Compibert's face at the bubble (#460): `hello` waves, `points` looks at the thing, `cheers` hops. Default: see `tourFace`. */
  face?: TourFace
}

export type TourFace = 'hello' | 'points' | 'cheers'

/** The face a step shows: its own, else pointing when it has a thing and hello when it has none. */
export function tourFace(step: TourStep): TourFace {
  return step.face ?? (step.target === null ? 'hello' : 'points')
}

/**
 * The Member's Tour: the greeting, the pointing steps in the order the spec names them (not the page's: a compact poll below the board in a running
 * Event still comes before it), then the end; the Host tour (#462) is a second list. Exactly one of `board`, `boardOpen` and `boardLocked` applies,
 * and `activity` (the side panel) or `tabs` (the phone's tab bar), so a run holds at most eight steps (#648).
 */
export const MEMBER_TOUR: readonly TourStep[] = [
  { id: 'greeting', target: null },
  { id: 'head', target: 'head' },
  { id: 'poll', target: 'poll', targetNarrow: 'poll-card', anchor: 'vote' },
  { id: 'board', target: 'board', anchor: 'me', applies: page => !page.teamChoiceOpen && page.phase !== 'running' },
  { id: 'boardOpen', target: 'board', anchor: 'me', applies: page => page.teamChoiceOpen },
  { id: 'boardLocked', target: 'board', anchor: 'me', applies: page => !page.teamChoiceOpen && page.phase === 'running' },
  { id: 'how', target: 'how' },
  { id: 'activity', target: 'panel', anchor: 'tab-activity', applies: page => page.wide },
  { id: 'tabs', target: 'tab-activity', applies: page => !page.wide },
  { id: 'sound', target: 'sound' },
  { id: 'end', target: null, face: 'cheers' },
]

/** The `data-tour` value a step points at on a window that is `narrow` or not: the narrow child where the step has one and it is narrow. */
export function tourThing(step: TourStep, narrow: boolean): string | null {
  return narrow && step.targetNarrow ? step.targetNarrow : step.target
}

/**
 * The steps of this run, in list order: a step stays when what it points at is on the page and its own rule agrees. A run with no pointing step
 * left is no run (#648): the greeting and the end alone are not a Tour, and `useTour` then starts nothing and saves nothing.
 */
export function tourRun(steps: readonly TourStep[], page: TourPage): TourStep[] {
  const run = steps.filter(step => (step.target === null || page.present.has(step.target)) && step.applies?.(page) !== false)
  return run.some(step => step.target !== null) ? run : []
}

export interface TourStartInput {
  /** The User's stored version; null when nobody is signed in. */
  storedVersion: number | null
  role: 'host' | 'member'
  /** The Event's Phase; null when there is no Event to read (deleted, not readable). */
  phase: Phase | null
  sessionRunning: boolean
  /** A sheet, dialog, menu or the Clip is open. */
  layerOpen: boolean
  /** How long the page has been calm, in ms. */
  calmFor: number
}

/**
 * The start rule, and the rule that ends a shown Tour by itself: a Member who has not seen this version, on an Event that is not
 * finished, with no Session running and no layer open for the calm second.
 */
export function tourMayStart(input: TourStartInput): boolean {
  return input.storedVersion !== null
    && input.storedVersion < TOUR_VERSION
    && input.role === 'member'
    && input.phase !== null
    && beforeFinish(input.phase)
    && !input.sessionRunning
    && !input.layerOpen
    && input.calmFor >= TOUR_CALM_MS
}

/** What the start rule reads of the Event read: `EventView` has it (`shared/` imports nothing of `app/`, and `event.ts` is not needed for three fields). */
export interface TourStartView {
  event: { isHost: boolean, phase: Phase }
  runningSessionId: string | null
}

/**
 * The start rule's inputs from the Event read (#829, review S2): the one place that maps the read to `TourStartInput`, so the Tour (`useTour`) and
 * the files the cue player requests for it (`useCuePlayer`) cannot drift when the rule gains an input. No read (not loaded, deleted, not readable)
 * gives a Member on no Event; the two values the page itself holds come in as they are.
 */
export function tourStartInputOf(view: TourStartView | null | undefined, storedVersion: number | null, layerOpen: boolean, calmFor: number): TourStartInput {
  return {
    storedVersion,
    role: view?.event.isHost ? 'host' : 'member',
    phase: view?.event.phase ?? null,
    sessionRunning: view != null && view.runningSessionId !== null,
    layerOpen,
    calmFor,
  }
}

/** One move of a run of `count` steps standing at `at`: the next index, or how the Tour is over. */
export function tourMove(count: number, at: number, action: 'next' | 'back' | 'skip'): { at: number } | { over: 'finished' | 'skipped' } {
  if (action === 'skip') return { over: 'skipped' }
  if (action === 'back') return { at: Math.max(at - 1, 0) }
  return at >= count - 1 ? { over: 'finished' } : { at: at + 1 }
}
