import { SESSIONS_MAX } from '../../shared/event'

// The Sessions of an Event (ADR 0011, #49). Pure: the create handler checks the count, the Event
// view numbers the Sessions and counts the missing Dates. Numbering lives only here.

/** The Session count of the create form: a whole number from 1 to 8 (SESSIONS_MAX). Null when invalid. */
export function parseSessionCount(raw: unknown): number | null {
  return Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= SESSIONS_MAX ? raw as number : null
}

/**
 * The number of each Session, in the order given. Sessions with a Date get 1…n in Date order
 * ("Session 1" is always the first evening); a Session without a Date gets null and only counts
 * as a missing Date. Equal Dates keep their given order.
 */
export function sessionNumbers(startsAt: (Date | null)[]): (number | null)[] {
  const numbers: (number | null)[] = startsAt.map(() => null)
  const dated = startsAt
    .map((date, index) => ({ date, index }))
    .filter((entry): entry is { date: Date, index: number } => entry.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.index - b.index)
  dated.forEach((entry, position) => {
    numbers[entry.index] = position + 1
  })
  return numbers
}

/** How many Sessions still wait for a Date. */
export function missingDates(startsAt: (Date | null)[]): number {
  return startsAt.filter(date => date === null).length
}

/**
 * The open Slots of an Event (#52): a Slot is open when no Session refers to it, because its Date came
 * from that Slot. `sessionSlotIds` are the Slot ids the Sessions refer to (null for none). Order is kept.
 */
export function openSlots<S extends { id: string }>(slots: S[], sessionSlotIds: (string | null)[]): S[] {
  const taken = new Set(sessionSlotIds.filter((id): id is string => id !== null))
  return slots.filter(slot => !taken.has(slot.id))
}
