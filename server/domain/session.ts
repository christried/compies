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

/** A Session as the Event holds it: its id and its set Date (null while it waits for one). */
export interface SessionDate {
  id: string
  startsAt: Date | null
}

/** Whether a Session other than `exceptId` has this instant as its set Date (#49: Dates are distinct). */
export function hasDateAt(sessions: SessionDate[], instant: Date, exceptId?: string): boolean {
  return sessions.some(session => session.id !== exceptId && session.startsAt?.getTime() === instant.getTime())
}

function numbersById(sessions: SessionDate[]): Map<string, number | null> {
  const numbers = sessionNumbers(sessions.map(session => session.startsAt))
  return new Map(sessions.map((session, index) => [session.id, numbers[index]!]))
}

/**
 * The Sessions whose .ics SEQUENCE goes up when the Event's Sessions change from `before` to `after`
 * (#53, #55): every Session still there whose Date moved or whose number (sessionNumbers) changed, so a
 * re-import replaces its entry with the new time or title. A Session that is new or gone has no entry
 * to replace, so it is left out. changeSessions calls this for every Session change.
 */
export function sequenceRaises(before: SessionDate[], after: SessionDate[]): string[] {
  const timeBefore = new Map(before.map(session => [session.id, session.startsAt?.getTime() ?? null]))
  const numberBefore = numbersById(before)
  const numberAfter = numbersById(after)
  return after
    .filter(session => timeBefore.has(session.id))
    .filter(session => timeBefore.get(session.id) !== (session.startsAt?.getTime() ?? null)
      || numberBefore.get(session.id) !== numberAfter.get(session.id))
    .map(session => session.id)
}
