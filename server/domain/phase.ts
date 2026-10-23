import type { Phase } from '../../shared/event'
import { isPast } from './poll'

// Phase transitions of an Event and the Date changes of its Session (#1 § Domain rules, ADR 0011).
// Pure: the handlers load the Event, ask the rule, and write the returned values in one transaction
// that holds the Event row. The .ics SEQUENCE is counted up in SQL by the handlers (`icsSequence + 1`).

export type PhaseRejection = 'wrong_phase' | 'in_past'

/** A new Date needs the Event in `from` and a time in the future. The phase is checked first. */
function newDateRejection(input: { phase: Phase, startsAt: Date, now: Date }, from: Phase): PhaseRejection | null {
  if (input.phase !== from) return 'wrong_phase'
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return null
}

/** Set the Date (poll → date_set): the Event must be in the poll phase and the time must be in the future. */
export function setDateRejection(input: { phase: Phase, startsAt: Date, now: Date }): PhaseRejection | null {
  return newDateRejection(input, 'poll')
}

/**
 * What a Set Date writes: the Event moves to `date_set`, and its Session gets the Date and the Slot the
 * Date came from (null when no Slot has that time). The previous Date is forgotten; Votes stay frozen by
 * their own rule (#1).
 */
export function setDateValues(startsAt: Date, slotId: string | null) {
  return { phase: 'date_set' as const, session: { startsAt, previousStartsAt: null, slotId } }
}

/**
 * Reschedule (#14, #53): only a Session that has a set Date moves, and only to a future time. The Event's
 * phase does not decide it: while another Session still waits for a Date, a dated one can move.
 */
export function rescheduleRejection(input: { hasDate: boolean, startsAt: Date, now: Date }): PhaseRejection | null {
  if (!input.hasDate) return 'wrong_phase'
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return null
}

/** The Session columns a Reschedule writes. The Slot it came from stays taken; the handler adds `icsSequence + 1`. */
export function rescheduleValues(startsAt: Date) {
  return { startsAt, previousStartsAt: null }
}

/** Reopen (date_set → poll, #14): withdraws a set Date. Only a set Date can be withdrawn. */
export function reopenRejection(input: { phase: Phase }): PhaseRejection | null {
  return input.phase === 'date_set' ? null : 'wrong_phase'
}

/**
 * What a Reopen writes: the Event goes back to `poll`, and its Session loses its Date and Slot, so the
 * Slot is open again. Votes are kept (#14). The handler adds two SQL expressions on the Session:
 * `previousStartsAt = starts_at` (the old Date, read in the same statement) and `icsSequence + 1`.
 */
export function reopenValues() {
  return { phase: 'poll' as const, session: { startsAt: null, slotId: null } }
}
