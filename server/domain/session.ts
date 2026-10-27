import { SESSIONS_MAX } from '../../shared/event'

// The Sessions of an Event (ADR 0011, #49). Pure: the create handler checks the count, the readers number the
// Sessions and count the missing Dates. Numbering, and the rule that only several Sessions get a number, live
// only here (#70).

/** The Session count of the create form: a whole number from 1 to 8 (SESSIONS_MAX). Null when invalid. */
export function parseSessionCount(raw: unknown): number | null {
  return Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= SESSIONS_MAX ? raw as number : null
}

/** A Session as the Event holds it: its id and its set Date (null while it waits for one). */
export interface SessionDate {
  id: string
  startsAt: Date | null
}

/** Whether the Session has its Date. */
export function isDated<S extends { startsAt: Date | null }>(session: S): session is S & { startsAt: Date } {
  return session.startsAt !== null
}

/**
 * The Sessions with the number they are shown with (#49, #53, #70): the dated ones first, in Date order, then
 * the ones still waiting for a Date, in the given order. The dated ones are numbered 1…n ("Session 1" is always
 * the first evening), but only while the Event has several Sessions: a single Session has nothing to tell apart,
 * so it is shown without a number. A Session without a Date has no number. Equal Dates keep their given order.
 * The Event page, Home and the calendar title all show this number, and sequenceRaises compares it.
 */
export function numberedSessions<S extends SessionDate>(sessions: S[]): (S & { number: number | null })[] {
  const several = sessions.length > 1
  // Array sort is stable, so equal Dates keep their given order.
  const dated = sessions.filter(isDated).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  return [
    ...dated.map((session, index) => ({ ...session, number: several ? index + 1 : null })),
    ...sessions.filter(session => session.startsAt === null).map(session => ({ ...session, number: null })),
  ]
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

/** Whether a Session other than `exceptId` has this instant as its set Date (#49: Dates are distinct). */
export function hasDateAt(sessions: SessionDate[], instant: Date, exceptId?: string): boolean {
  return sessions.some(session => session.id !== exceptId && session.startsAt?.getTime() === instant.getTime())
}

/** A Session's Date as a number, or null while it has none. */
function timeOf(session: SessionDate): number | null {
  return session.startsAt?.getTime() ?? null
}

/**
 * The Sessions whose .ics SEQUENCE goes up when the Event's Sessions change from `before` to `after`
 * (#53, #55, #67): every Session still there whose Date moved or whose shown number (numberedSessions) changed,
 * so a re-import replaces its entry with the new time or title. The shown number also changes when the Event
 * goes from one Session to several or back, since only several Sessions are numbered. A Session that is new or
 * gone has no entry to replace, so it is left out. In the order the Sessions are shown after the change.
 * changeSessions calls this for every Session change.
 */
export function sequenceRaises(before: SessionDate[], after: SessionDate[]): string[] {
  const shownBefore = new Map(numberedSessions(before).map(session => [session.id, session]))
  return numberedSessions(after)
    .filter((session) => {
      const was = shownBefore.get(session.id)
      return was !== undefined && (timeOf(was) !== timeOf(session) || was.number !== session.number)
    })
    .map(session => session.id)
}
