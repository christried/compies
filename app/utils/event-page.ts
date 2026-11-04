import { hasStarted, nextSession, runningOf, sessionState } from '~~/shared/session-state'
import { datePollOpen, type EventView, type Phase, type SessionView } from '~~/shared/event'
import { teamName } from './board'
import type { Translate } from './settings-summary'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the blocks of the stage
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too. Adding a block, a dock action or a
// page state touches this one list (review 1.4 A4, #228): the state says which blocks the stage shows and in which order.

// `end` is optional: the Host dock reads this state too and has no use for the Standings (#274).
export type PageInput = Pick<EventView, 'settings' | 'sessions' | 'missingDates' | 'setGame' | 'wheel' | 'countdown' | 'coin'> & Partial<Pick<EventView, 'end'>> & { event: Pick<EventView['event'], 'phase'> }

/**
 * Which data blocks the stage has, from the view (#256): a block that shows data is listed only while its data is there, so the
 * template checks nothing of its own. `pool` is the Host's pool warning (#234); `standings` is true from the first Result on (#274).
 */
export interface StagePresent { wheel: boolean, pool: boolean, countdown: boolean, coin: boolean, standings: boolean }

/**
 * The blocks of the stage (#166, #228). `head`: kicker and title. `reopen`: the notices of reopened Dates. `pool`: the Host's live pool warning (#234), shown to the Host only. `setup`: the Event
 * is not set up. `seat`: where the Host sits. `poll`: the Date poll. `wheel`: the Lucky Wheel, on top of the Rounds (#229).
 * `rounds`: the open Rounds, whenever there are some (the Host enters their Results between Sessions too, #273). `standings`: the Standings, once the first Result exists, right after the open Rounds (#274). `history`: the Spielverlauf, the Rounds with their Results, on the finished stage only (#277). `countdown`: the Countdown (#236). `coin`: the Coin flip (#235). `board`: the Game board. `cards`: the
 * Sessions and „So wird gespielt“. `stay`: the teams stay between two Sessions.
 */
export type Block = 'head' | 'reopen' | 'setup' | 'seat' | 'poll' | 'pool' | 'wheel' | 'rounds' | 'standings' | 'history' | 'countdown' | 'coin' | 'board' | 'cards' | 'stay'

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
 * `kind`, so a reader of a kind has what the kind guarantees without asserting it (review 1.4 N10). `finished`: the Host finished the Event
 * (Phase `finished`, #277): read-only for everybody, with no Running Session.
 */
export type EventPageState
  = | (PageCommon & { kind: 'setup' | 'poll' | 'between' | 'done' | 'finished', running: null })
    | (PageCommon & { kind: 'teams', next: NextSession, running: null })
    | (PageCommon & { kind: 'running', running: RunningSession })

type Kind = EventPageState['kind']

/**
 * The blocks of the stage per state (11-event-seite § EventPage): what has to happen now goes on top. The poll while no
 * Session is dated, the Game board from the first Date on, the open Rounds above it while a Session runs (and between Sessions, where their Results are entered too, #273) and the Standings right
 * after them once a Result exists (#274), with the wheel on top of the Rounds when the view has wheel data (`present.wheel`, #229) and the Countdown (#236) and the coin toss (#235) under them,
 * the Sessions card between two Sessions. The finished Event (#277) has the Standings and the history as its stage, no board and no open Rounds. The Reopen notices sit right under the Head in every state. A Session that still waits
 * for a Date has its poll (compact) below the board once another Session is dated or started.
 */
export function pageBlocks(kind: Kind, pollOpen: boolean, present: StagePresent): Block[] {
  const poll: Block[] = pollOpen ? ['poll'] : []
  const wheel: Block[] = present.wheel ? ['wheel'] : []
  const pool: Block[] = present.pool ? ['pool'] : []
  const countdown: Block[] = present.countdown ? ['countdown'] : []
  const coin: Block[] = present.coin ? ['coin'] : []
  const standings: Block[] = present.standings ? ['standings'] : []
  // Both need the first Result; a finished Event has at least one (#277).
  const history: Block[] = present.standings ? ['history'] : []
  switch (kind) {
    case 'poll': return ['head', 'reopen', ...poll, 'board', 'cards']
    case 'teams': return ['head', 'reopen', 'seat', 'board', ...poll, 'cards']
    // The Host's pool warning (#234) comes after the drawn Round: wheel and open Rounds first (story 15, review 0.7 F12).
    case 'running': return ['head', 'reopen', ...wheel, 'rounds', ...standings, ...pool, ...countdown, ...coin, 'board', ...poll, 'cards']
    case 'between': return ['head', 'reopen', 'rounds', ...standings, 'cards', 'stay', 'board', ...poll]
    case 'done': return ['head', 'reopen', 'rounds', ...standings, 'cards', 'board']
    case 'setup': return ['head', 'reopen', 'setup', ...poll, 'board', 'cards']
    // The notices of removed Sessions stay (story 56) and so do the Sessions and „So wird gespielt“, read-only already (#277).
    case 'finished': return ['head', 'reopen', ...standings, ...history, 'cards']
  }
}

/** The poll is the quiet one below the board as soon as the page is about something else than the Date. */
export function pollCompactIn(kind: Kind): boolean {
  return kind !== 'poll' && kind !== 'setup'
}

/** Between two Sessions and after the last the Sessions card is the news of the page and gets a shadow; in a finished Event the news is the winner. */
export function cardsStandOutIn(kind: Kind): boolean {
  return kind === 'between' || kind === 'done'
}

/** The first Session has started (#164): the page's kind is `running`, `between`, `done` or `finished`. */
export function startedIn(kind: Kind): boolean {
  return kind === 'running' || kind === 'between' || kind === 'done' || kind === 'finished'
}

/** The notice about uneven teams has a place on the page: not in a running Session and not after the last one (#166). */
export function unevenNoticeIn(kind: Kind): boolean {
  return kind !== 'running' && kind !== 'done' && kind !== 'finished'
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
 * the poll, the Date that stands, the Session that runs, no Date left. `phase` is the pill's look and word; `noDate` swaps the word
 * for „Kein Termin“ (#277), with the grey dot of `draft`: every Session ended, but the Host has not finished the Event, so „Beendet“ would
 * say more than is true. `finished` is the Phase's own word. null in `setup`, where the Event's own Phase stays.
 */
export function pagePill(state: Pick<EventPageState, 'kind' | 'next'>): { phase: Phase, noDate: boolean } | null {
  switch (state.kind) {
    case 'poll': return { phase: 'poll', noDate: false }
    case 'teams': return { phase: 'date_set', noDate: false }
    case 'running': return { phase: 'running', noDate: false }
    case 'between': return { phase: state.next ? 'date_set' : 'poll', noDate: false }
    case 'done': return { phase: 'draft', noDate: true }
    case 'finished': return { phase: 'finished', noDate: false }
    default: return null
  }
}

/**
 * The Host's seat note (teams only, #160): where the Host sits does not change the dock, and the note says so. null for a Member,
 * on the Bench, or in a Team the note has no word for.
 */
export function seatNote(view: Pick<EventView, 'members' | 'viewerId' | 'teams'> & { event: Pick<EventView['event'], 'isHost'> }, t: Translate): string | null {
  const me = view.members.find(member => member.id === view.viewerId)
  if (!view.event.isHost || !me) return null
  if (me.zone === 'stands') return t('event.notice.seatStands')
  if (me.zone !== 'team' || me.team === null) return null
  return t('event.notice.seatTeam', { team: teamName(view.teams.find(team => team.position === me.team) ?? me.team, t) })
}

/** What the Teams-bleiben notice names: the next Session by its number, or „der nächsten“ when it has none yet or is the only one. */
export function teamsStay(next: NextSession | null, isHost: boolean, t: Translate): string {
  const number = next?.number ?? null
  const key = number === null ? (isHost ? 'teamsStayNext' : 'teamsStayMemberNext') : (isHost ? 'teamsStay' : 'teamsStayMember')
  return t(`event.notice.${key}`, { n: number })
}

/**
 * The header pill for a page state (pagePill, #166): „Läuft · Session 1 von 2“ while a Session runs in an Event with several, „Kein Termin“
 * after the last one, until the Host finishes the Event. Without a state or a pill, the Event's own Phase (or poll) and no label.
 */
export function headerPill(state: EventPageState | null, phase: Phase | undefined, t: Translate): { phase: Phase, label: string | undefined } {
  const shown = state ? pagePill(state) : null
  if (!state || !shown) return { phase: phase ?? 'poll', label: undefined }
  if (shown.noDate) return { phase: shown.phase, label: t('phase.noDate') }
  const several = state.kind === 'running' && state.total > 1
  return { phase: shown.phase, label: several ? t('event.pill.running', { n: state.running?.number, total: state.total }) : undefined }
}

export function eventPageState({ settings, sessions, missingDates, event, setGame, wheel, countdown, coin, end }: PageInput): EventPageState {
  const waiting = nextSession(sessions)
  const runningSession = runningOf(sessions)
  const ended = sessions
    .filter(session => sessionState(session) === 'ended')
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!))[0]
  const pollOpen = datePollOpen(event.phase, missingDates)
  const present: StagePresent = { wheel: Boolean(wheel), pool: Boolean(setGame?.poolWarning), countdown: Boolean(countdown), coin: Boolean(coin), standings: (end?.played ?? 0) > 0 }

  const next = waiting ? { number: waiting.number, startsAt: waiting.startsAt } : null
  /** The state of kind `kind`, with the lists that follow from the kind. */
  const common = (kind: Kind) => ({
    total: sessions.length,
    next,
    lastEnded: ended ? { number: ended.number } : null,
    pollNumber: pollingNumber(sessions, missingDates),
    blocks: pageBlocks(kind, pollOpen, present),
    pollCompact: pollCompactIn(kind),
    cardsStandOut: cardsStandOutIn(kind),
  })

  if (settings === null) return { ...common('setup'), kind: 'setup', running: null }
  // Before the Running-Session branch: a finished Event has none, but a fixture may (#277).
  if (event.phase === 'finished') return { ...common('finished'), kind: 'finished', running: null }
  if (runningSession) return { ...common('running'), kind: 'running', running: { number: runningSession.number, startedAt: runningSession.startedAt } }
  if (!hasStarted(sessions)) return next ? { ...common('teams'), kind: 'teams', next, running: null } : { ...common('poll'), kind: 'poll', running: null }
  const kind = waiting || missingDates > 0 ? 'between' : 'done'
  return { ...common(kind), kind, running: null }
}
