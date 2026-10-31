import { hasStarted, nextSession } from '~~/shared/board'
import type { EventView, Phase, SessionView } from '~~/shared/event'

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

export function eventPageState({ settings, sessions, missingDates, runningSessionId }: PageInput): EventPageState {
  const waiting = nextSession(sessions)
  const runningSession = sessions.find(session => session.id === runningSessionId)
  const ended = sessions
    .filter(session => session.endedAt !== null)
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!))[0]
  const started = hasStarted(sessions)

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
