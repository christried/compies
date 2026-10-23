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

/** The Phase an Event has from its Sessions' Dates (#52): the date poll while any Session has no Date, else date set. */
export function phaseOf(startsAt: (Date | null)[]): 'poll' | 'date_set' {
  return startsAt.some(date => date === null) ? 'poll' : 'date_set'
}

export type SetDateRejection = PhaseRejection | 'slot_taken'

/**
 * Setting a Date from a Slot (#52): the Event is in the poll phase with a Session that waits for a Date
 * (`undated` counts them), the Slot is not one a Session already has as its Date (`taken`), and its time
 * is in the future. Checked in that order.
 */
export function setDateRejection(input: { phase: Phase, startsAt: Date, now: Date, taken: boolean, undated: number }): SetDateRejection | null {
  if (input.phase !== 'poll' || input.undated === 0) return 'wrong_phase'
  if (input.taken) return 'slot_taken'
  if (isPast(input.startsAt, input.now)) return 'in_past'
  return null
}

/**
 * What a Set Date writes (#52): the undated Session gets the Date and the Slot it came from (null when no
 * Slot has that time). The Event stays in the poll while another Session waits, else moves to `date_set`.
 * The previous Date is forgotten; Votes stay frozen by their own rule (#1, #52).
 */
export function setDateValues(startsAt: Date, slotId: string | null, undated: number) {
  const phase = undated > 1 ? 'poll' as const : 'date_set' as const
  return { phase, session: { startsAt, previousStartsAt: null, slotId } }
}

/** Reschedule (date_set → date_set, #14): only a set Date moves, and only to a future time. */
export function rescheduleRejection(input: { phase: Phase, startsAt: Date, now: Date }): PhaseRejection | null {
  return newDateRejection(input, 'date_set')
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
