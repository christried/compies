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
}

export interface TourStep {
  /** Names the step's texts: `tour.<id>.title` and `tour.<id>.text`. */
  id: string
  /** The value of the `data-tour` attribute of the thing it points at; null points at nothing. */
  target: string | null
  /** A further rule beyond the target being on the page (#648 uses it for the phone's tabs against the panel). */
  applies?: (page: TourPage) => boolean
  /** Compibert's face at the bubble (#460): `hello` waves, `points` looks at the thing, `cheers` hops. Default: see `tourFace`. */
  face?: TourFace
}

export type TourFace = 'hello' | 'points' | 'cheers'

/** The face a step shows: its own, else pointing when it has a thing and hello when it has none. */
export function tourFace(step: TourStep): TourFace {
  return step.face ?? (step.target === null ? 'hello' : 'points')
}

/** The Member's Tour: the greeting, the head (#460), then #648's pointing steps, then the end; the Host tour (#462) is a second list. */
export const MEMBER_TOUR: readonly TourStep[] = [
  { id: 'greeting', target: null },
  { id: 'head', target: 'head' },
  { id: 'end', target: null, face: 'cheers' },
]

/** The steps of this run, in list order: a step stays when what it points at is on the page and its own rule agrees. */
export function tourRun(steps: readonly TourStep[], page: TourPage): TourStep[] {
  return steps.filter(step => (step.target === null || page.present.has(step.target)) && step.applies?.(page) !== false)
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

/** One move of a run of `count` steps standing at `at`: the next index, or how the Tour is over. */
export function tourMove(count: number, at: number, action: 'next' | 'back' | 'skip'): { at: number } | { over: 'finished' | 'skipped' } {
  if (action === 'skip') return { over: 'skipped' }
  if (action === 'back') return { at: Math.max(at - 1, 0) }
  return at >= count - 1 ? { over: 'finished' } : { at: at + 1 }
}
