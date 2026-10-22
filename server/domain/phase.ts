import { isPast } from './poll'

// Phase transitions of a Session (#1 § Domain rules). Pure: the handlers load the Session, ask the
// rule, and write the returned values with a conditional update. Reschedule and Reopen (#14) add
// their rules here with the same shape.

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
