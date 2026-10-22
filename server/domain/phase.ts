import { isPast } from './poll'

// Phase transitions of a Session (#1 § Domain rules). Pure: the handlers load the Session, ask the
// rule, and write the returned values with a conditional update. The .ics SEQUENCE is counted up in
// SQL by the handlers (`icsSequence + 1`), so two writes at once cannot both produce the same number.

export type PhaseRejection = 'wrong_phase' | 'in_past'

/** Set the Date (poll → date_set): the Session must be in the poll phase and the time must be in the future. */
export function setDateRejection(input: { phase: string, startsAt: Date, now: Date }): PhaseRejection | null {
  if (input.phase !== 'poll') return 'wrong_phase'
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return null
}

/** The columns a Set Date writes. The previous Date is forgotten; votes stay frozen by their own rule (#1). */
export function setDateValues(startsAt: Date) {
  return { phase: 'date_set' as const, startsAt, previousStartsAt: null }
}

/** Reschedule (date_set → date_set, #14): only a set Date moves, and only to a future time. */
export function rescheduleRejection(input: { phase: string, startsAt: Date, now: Date }): PhaseRejection | null {
  if (input.phase !== 'date_set') return 'wrong_phase'
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return null
}

/** The columns a Reschedule writes. The handler adds `icsSequence + 1` so calendars update the same event. */
export function rescheduleValues(startsAt: Date) {
  return { startsAt, previousStartsAt: null }
}

/** Reopen (date_set → poll, #14): withdraws a set Date. Only a set Date can be withdrawn. */
export function reopenRejection(input: { phase: string }): PhaseRejection | null {
  return input.phase === 'date_set' ? null : 'wrong_phase'
}

/**
 * The columns a Reopen writes. Slots and Votes are kept (#14). The handler adds two SQL expressions:
 * `previousStartsAt = starts_at` (the old Date, read in the same statement) and `icsSequence + 1`.
 */
export function reopenValues() {
  return { phase: 'poll' as const, dateMode: 'poll' as const, startsAt: null }
}
