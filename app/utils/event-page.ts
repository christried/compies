import { hasStarted, nextSession, noSessionLeft, runningOf, sessionState, type SessionState } from '~~/shared/session-state'
import type { EventView, Phase, SessionView } from '~~/shared/event'
import { leadingTeams } from '~~/shared/finish'
import { teamNameAt } from './board'
import { stageBlocks, type Block, type PageKind, type StageInput } from './event-stage'
import type { Translate } from './settings-summary'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the blocks of the stage
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too. The kind and the session facts are here;
// which blocks the stage lists for a kind, and in which order, is the Stage module's (event-stage.ts, #415).

// `end` is required: the page reads it for the Standings and the finish (#274, #288). `rounds` is optional: the Host dock has none, and a missing list counts as none open (#278).
export type PageInput = StageInput

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
  /** The poll is the quiet one below the board as soon as the page is about something else than the Date. */
  pollCompact: boolean
  /** Between two Sessions and after the last the Sessions card is the news of the page and gets a shadow. */
  cardsStandOut: boolean
}

/**
 * `setup`: no settings. `poll`: no Session is dated. `teams`: a Session is dated, none started (so `next` is there). `running`:
 * a Session runs (so `running` is there). `between`: a Session ended, more are to come. `done`: every Session ended. A union by
 * `kind`, so a reader of a kind has what the kind guarantees without asserting it (review 1.4 N10). `finished`: the Host finished the Event
 * (Phase `finished`, #277): read-only for everybody, with no Running Session. The facts need no Host and no stage data: the dock has them too (#415).
 */
export type PageFacts
  = | (PageCommon & { kind: 'setup' | 'poll' | 'between' | 'done' | 'finished', running: null })
    | (PageCommon & { kind: 'teams', next: NextSession, running: null })
    | (PageCommon & { kind: 'running', running: RunningSession })

/** The facts and the blocks of the stage, top to bottom (the Stage module's list for the kind). */
export type EventPageState = PageFacts & { blocks: Block[] }

type Kind = PageKind

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

export type SessionMenuKey = 'calendar' | 'reschedule' | 'reopen' | 'remove'

/**
 * The entries of a Session row's „Mehr“ menu, in order, destructive last (#349); empty means the row has no menu. Only a dated Session
 * that has not started has one: everybody can take it to the calendar, the Host moves it, and while Sessions can change (`canChangeSessions`)
 * starts a new search for its Date or, with more than one Session, removes it.
 */
export function sessionMenuKeys(input: { kind: SessionState, isHost: boolean, canChangeSessions: boolean, several: boolean }): SessionMenuKey[] {
  if (input.kind !== 'set') return []
  const keys: SessionMenuKey[] = ['calendar']
  if (input.isHost) keys.push('reschedule')
  if (input.isHost && input.canChangeSessions) keys.push('reopen')
  if (input.isHost && input.canChangeSessions && input.several) keys.push('remove')
  return keys
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
 * or in a Team the note has no word for.
 */
export function seatNote(view: Pick<EventView, 'members' | 'viewerId' | 'teams'> & { event: Pick<EventView['event'], 'isHost'> }, t: Translate): string | null {
  const me = view.members.find(member => member.id === view.viewerId)
  if (!view.event.isHost || !me) return null
  if (me.zone === 'stands') return t('event.notice.seatStands')
  if (me.zone !== 'team' || me.team === null) return null
  return t('event.notice.seatTeam', { team: teamNameAt(view.teams, me.team, t) })
}

/**
 * Whether Compibert's header wears the party hat for this viewer (#38): seated in a team that is a Leading Party (leadingTeams, from the
 * Standings and the Results the page holds). The Host is a Member here, and a Member on the Stands never wears it.
 */
export function wearsPartyhat(view: Pick<EventView, 'members' | 'viewerId' | 'standings' | 'results'> & { event: Pick<EventView['event'], 'phase'> }): boolean {
  const me = view.members.find(member => member.id === view.viewerId)
  if (!me || me.zone !== 'team' || me.team === null) return false
  return leadingTeams(view.standings ?? [], view.event.phase, view.results.length > 0).includes(me.team)
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

export function pageFacts({ settings, sessions, missingDates, event }: Pick<EventView, 'settings' | 'sessions' | 'missingDates'> & { event: Pick<EventView['event'], 'phase'> }): PageFacts {
  const waiting = nextSession(sessions)
  const runningSession = runningOf(sessions)
  const ended = sessions
    .filter(session => sessionState(session) === 'ended')
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!))[0]

  const next = waiting ? { number: waiting.number, startsAt: waiting.startsAt } : null
  /** The facts of kind `kind`: the lists that follow from the kind. */
  const common = (kind: Kind) => ({
    total: sessions.length,
    next,
    lastEnded: ended ? { number: ended.number } : null,
    pollNumber: pollingNumber(sessions, missingDates),
    pollCompact: pollCompactIn(kind),
    cardsStandOut: cardsStandOutIn(kind),
  })

  if (settings === null) return { ...common('setup'), kind: 'setup', running: null }
  // Before the Running-Session branch: a finished Event has none, but a fixture may (#277).
  if (event.phase === 'finished') return { ...common('finished'), kind: 'finished', running: null }
  if (runningSession) return { ...common('running'), kind: 'running', running: { number: runningSession.number, startedAt: runningSession.startedAt } }
  if (!hasStarted(sessions)) return next ? { ...common('teams'), kind: 'teams', next, running: null } : { ...common('poll'), kind: 'poll', running: null }
  // `done` is the „Kein Termin“ of Home's card too: one rule, noSessionLeft (#277).
  const kind = noSessionLeft(sessions, missingDates) ? 'done' : 'between'
  return { ...common(kind), kind, running: null }
}

/**
 * The state of the Event page: its facts and the blocks the Stage module lists for its kind, in the order of `now` (epoch ms, server time; the page's order clock, #441).
 * null counts every moment: the server render, a hidden tab, a Host dock that only wants the facts.
 */
export function eventPageState(input: PageInput, now: number | null = null): EventPageState {
  const facts = pageFacts(input)
  return { ...facts, blocks: stageBlocks(input, facts.kind, now) }
}
