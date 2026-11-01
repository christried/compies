import { hasStarted, nextSession, runningOf, sessionState } from '~~/shared/session-state'
import { hasWheel } from '~~/shared/settings'
import { datePollOpen, type EventView, type Phase, type SessionView } from '~~/shared/event'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the blocks of the stage
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too. Adding a block, a dock action or a
// page state touches this one list (review 1.4 A4, #228): the state says which blocks the stage shows and in which order.

export type PageInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates'> & { event: Pick<EventView['event'], 'phase'> }

/**
 * The blocks of the stage (#166, #228). `head`: kicker and title. `reopen`: the notices of reopened Dates. `setup`: the Event
 * is not set up. `seat`: where the Host sits. `poll`: the Date poll. `wheel`: the Lucky Wheel, on top of the Rounds (#229).
 * `rounds`: the open Rounds, in a running Session. `countdown`: the Countdown (#236). `coin`: the Coin flip (#235). `board`: the Game board. `cards`: the
 * Sessions and „So wird gespielt“. `stay`: the teams stay between two Sessions.
 */
export type Block = 'head' | 'reopen' | 'setup' | 'seat' | 'poll' | 'wheel' | 'rounds' | 'countdown' | 'coin' | 'board' | 'cards' | 'stay'

/** The next Session to start (the earliest dated one that has not started): its shown number (null for an only Session) and Date. */
export interface NextSession { number: number | null, startsAt: string }

/** The Running Session: its shown number and when it started. */
export interface RunningSession { number: number | null, startedAt: string }

interface PageCommon {
  /** How many Sessions the Event has. */
  total: number
  next: NextSession | null
  /** The Session that ended last: its shown number. */
  lastEnded: { number: number | null } | null
  /** The shown number a Session that still polls will have (after the dated ones); null when none polls or the Event has one Session. */
  pollNumber: number | null
  /** The blocks of the stage, top to bottom. */
  blocks: Block[]
  /** The poll is the quiet one below the board as soon as the page is about something else than the Date. */
  pollCompact: boolean
  /** Between two Sessions and after the last the Sessions card is the news of the page and gets a shadow. */
  cardsStandOut: boolean
}

/**
 * `setup`: no settings. `poll`: no Session is dated. `teams`: a Session is dated, none started (so `next` is there). `running`:
 * a Session runs (so `running` is there). `between`: a Session ended, more are to come. `done`: every Session ended. A union by
 * `kind`, so a reader of a kind has what the kind guarantees without asserting it (review 1.4 N10).
 */
export type EventPageState
  = | (PageCommon & { kind: 'setup' | 'poll' | 'between' | 'done', running: null })
    | (PageCommon & { kind: 'teams', next: NextSession, running: null })
    | (PageCommon & { kind: 'running', running: RunningSession })

type Kind = EventPageState['kind']

/**
 * The blocks of the stage per state (11-event-seite § EventPage): what has to happen now goes on top. The poll while no
 * Session is dated, the Game board from the first Date on, the open Rounds above it while a Session runs, with the wheel on top
 * of them when the Event plays with the Lucky Wheel (`lucky`, #229) and the Countdown (#236) under them, the Sessions card
 * between two Sessions. The Reopen notices sit right under the Head in every state. A Session that still waits for a Date has its
 * poll (compact) below the board once another Session is dated or started.
 */
export function pageBlocks(kind: Kind, pollOpen: boolean, lucky = false): Block[] {
  const poll: Block[] = pollOpen ? ['poll'] : []
  const wheel: Block[] = lucky ? ['wheel'] : []
  switch (kind) {
    case 'poll': return ['head', 'reopen', ...poll, 'board', 'cards']
    case 'teams': return ['head', 'reopen', 'seat', 'board', ...poll, 'cards']
    // The Countdown (#236) sits under the open Rounds and is shown only while the Event has one (the page checks it).
    case 'running': return ['head', 'reopen', ...wheel, 'rounds', 'countdown', 'coin', 'board', ...poll, 'cards']
    case 'between': return ['head', 'reopen', 'cards', 'stay', 'board', ...poll]
    case 'done': return ['head', 'reopen', 'cards', 'board']
    case 'setup': return ['head', 'reopen', 'setup', ...poll, 'board', 'cards']
  }
}

/** The poll is the quiet one below the board as soon as the page is about something else than the Date. */
export function pollCompactIn(kind: Kind): boolean {
  return kind !== 'poll' && kind !== 'setup'
}

/** Between two Sessions and after the last the Sessions card is the news of the page and gets a shadow. */
export function cardsStandOutIn(kind: Kind): boolean {
  return kind === 'between' || kind === 'done'
}

/**
 * Why "Termin festlegen" cannot set a Date right now (#52), as an i18n key, or null: no open Slot at all, or none in the
 * future. The dock shows it as the action's reason and the confirm dialog as a toast.
 */
export function dateBlockedKey(slots: readonly { past: boolean }[]): 'mvp.set.noSlots' | 'mvp.set.noFutureSlot' | null {
  if (slots.length === 0) return 'mvp.set.noSlots'
  return slots.every(slot => slot.past) ? 'mvp.set.noFutureSlot' : null
}

/**
 * The shown number the `nth` Session that still polls will have (1 = the first): after the dated ones, in list order.
 * null when fewer than `nth` poll, or the Event has one Session. A Session keeps no number until it has a Date
 * (GLOSSARY: Session); this is the number the page shows it with meanwhile (#201).
 */
export function pollingNumber(sessions: Pick<SessionView, 'startsAt'>[], missingDates: number, nth = 1): number | null {
  return missingDates >= nth && sessions.length > 1 ? sessions.filter(session => session.startsAt !== null).length + nth : null
}

/**
 * The number each Session of the list is shown with, in list order (#201): a dated one its own `number`, one that still
 * polls the number it will get (pollingNumber), so the list, the dock and the Head agree.
 */
export function shownSessionNumbers(sessions: Pick<SessionView, 'startsAt' | 'number'>[], missingDates: number): (number | null)[] {
  let nth = 0
  return sessions.map(session => (session.startsAt === null ? pollingNumber(sessions, missingDates, ++nth) : session.number))
}

/**
 * What the Phase pill in the header says, from the page state (design `frame()`): the Event's Phase is running from the
 * first start on, which would say „Läuft“ between two Sessions and after the last. The pill follows the Sessions instead:
 * the poll, the Date that stands, the Session that runs, over. `phase` is the pill's look and word; `ended` swaps the word
 * for „Vorbei“ (the finished look). null in `setup`, where the Event's own Phase stays.
 */
export function pagePill(state: Pick<EventPageState, 'kind' | 'next'>): { phase: Phase, ended: boolean } | null {
  switch (state.kind) {
    case 'poll': return { phase: 'poll', ended: false }
    case 'teams': return { phase: 'date_set', ended: false }
    case 'running': return { phase: 'running', ended: false }
    case 'between': return { phase: state.next ? 'date_set' : 'poll', ended: false }
    case 'done': return { phase: 'finished', ended: true }
    default: return null
  }
}

export function eventPageState({ settings, sessions, missingDates, event }: PageInput): EventPageState {
  const waiting = nextSession(sessions)
  const runningSession = runningOf(sessions)
  const ended = sessions
    .filter(session => sessionState(session) === 'ended')
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!))[0]
  const pollOpen = datePollOpen(event.phase, missingDates)

  const next = waiting ? { number: waiting.number, startsAt: waiting.startsAt } : null
  /** The state of kind `kind`, with the lists that follow from the kind. */
  const common = (kind: Kind) => ({
    total: sessions.length,
    next,
    lastEnded: ended ? { number: ended.number } : null,
    pollNumber: pollingNumber(sessions, missingDates),
    blocks: pageBlocks(kind, pollOpen, settings !== null && hasWheel(settings.selectionMode)),
    pollCompact: pollCompactIn(kind),
    cardsStandOut: cardsStandOutIn(kind),
  })

  if (settings === null) return { ...common('setup'), kind: 'setup', running: null }
  if (runningSession) return { ...common('running'), kind: 'running', running: { number: runningSession.number, startedAt: runningSession.startedAt } }
  if (!hasStarted(sessions)) return next ? { ...common('teams'), kind: 'teams', next, running: null } : { ...common('poll'), kind: 'poll', running: null }
  const kind = waiting || missingDates > 0 ? 'between' : 'done'
  return { ...common(kind), kind, running: null }
}
