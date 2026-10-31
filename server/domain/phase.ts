import { SESSIONS_MAX, datePollOpen, sessionsEditable, type Phase } from '../../shared/event'
import { isPast } from './poll'

// Phase transitions of an Event and the Date changes of its Session (#1 § Domain rules, ADR 0011).
// Pure: the handlers load the Event, ask the rule, and write the returned values in one transaction
// that holds the Event row. The .ics SEQUENCE is raised by changeSessions (server/utils/sessions.ts).

export type PhaseRejection = 'wrong_phase' | 'in_past'

/** A Session that has started is fixed (#164): it is not removed, rescheduled or reopened. */
export type StartedRejection = 'session_started'

/** The Phase an Event has from its Sessions' Dates (#52): the date poll while any Session has no Date, else date set. */
export function phaseOf(startsAt: (Date | null)[]): 'poll' | 'date_set' {
  return startsAt.some(date => date === null) ? 'poll' : 'date_set'
}

/**
 * The Phase after a change to the Sessions (#55): the Dates decide only while the Event is in the date
 * poll or date set. A running, finished or archived Event keeps its Phase when a Session is added,
 * removed or reopened.
 */
export function phaseAfterChange(phase: Phase, startsAt: (Date | null)[]): Phase {
  return phase === 'poll' || phase === 'date_set' ? phaseOf(startsAt) : phase
}

export type SetDateRejection = PhaseRejection | 'slot_taken' | 'duplicate_date'

/**
 * Setting a Date from a Slot (#52): the Date poll is open (datePollOpen: a Session waits for a Date, in the poll or a running Event, #164)
 * (`undated` counts them), the Slot is not one a Session already has as its Date (`taken`), its time is in
 * the future, and no other Session has that time (`duplicate`, #49: distinct Dates). Checked in that order.
 */
export function setDateRejection(input: { phase: Phase, startsAt: Date, now: Date, taken: boolean, undated: number, duplicate: boolean }): SetDateRejection | null {
  if (!datePollOpen(input.phase, input.undated)) return 'wrong_phase'
  if (input.taken) return 'slot_taken'
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return input.duplicate ? 'duplicate_date' : null
}

/**
 * Reschedule (#14, #53): only a Session that has a set Date moves, to a future time that no other Session
 * has (#49: distinct Dates). The Event's phase does not decide it: while another Session still waits for
 * a Date, a dated one can move. A Session that has started stays where it is (#164).
 */
export function rescheduleRejection(input: { hasDate: boolean, started: boolean, startsAt: Date, now: Date, duplicate: boolean }): PhaseRejection | StartedRejection | 'duplicate_date' | null {
  if (input.started) return 'session_started'
  if (!input.hasDate) return 'wrong_phase'
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return input.duplicate ? 'duplicate_date' : null
}

/**
 * Reopen (#14, #55): withdraws one Session's set Date. Only a set Date can be withdrawn, in an Event whose
 * Sessions can still change, and never a Session that has started (#164). Other Sessions keep their Dates, so the
 * Event may stay date set.
 */
export function reopenRejection(input: { phase: Phase, hasDate: boolean, started: boolean }): PhaseRejection | StartedRejection | null {
  if (input.started) return 'session_started'
  return sessionsEditable(input.phase) && input.hasDate ? null : 'wrong_phase'
}

export type SessionRejection = PhaseRejection | StartedRejection | 'duplicate_date' | 'sessions_max' | 'last_session'

/**
 * Adding a Session (#55): in an editable Phase with room for one more (at most SESSIONS_MAX). A given Date
 * is in the future and not another Session's Date; without a Date the Session waits for the poll.
 */
export function addSessionRejection(input: { phase: Phase, count: number, startsAt: Date | null, now: Date, duplicate: boolean }): SessionRejection | null {
  if (!sessionsEditable(input.phase)) return 'wrong_phase'
  if (input.count >= SESSIONS_MAX) return 'sessions_max'
  if (input.startsAt === null) return null
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return input.duplicate ? 'duplicate_date' : null
}

/** Removing a Session (#55, dated or not): in an editable Phase, never one that has started (#164), and never the last Session of the Event. */
export function removeSessionRejection(input: { phase: Phase, count: number, started: boolean }): SessionRejection | null {
  if (input.started) return 'session_started'
  if (!sessionsEditable(input.phase)) return 'wrong_phase'
  return input.count > 1 ? null : 'last_session'
}
