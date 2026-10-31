import { SESSIONS_MAX } from '../../shared/event'

// The Sessions of an Event (ADR 0011, #49). Pure: the create handler checks the count, the readers number the
// Sessions and count the missing Dates. Numbering, and the rule that only several Sessions get a number, live
// only here (#70).

/** The Session count of the create form: a whole number from 1 to 8 (SESSIONS_MAX). Null when invalid. */
export function parseSessionCount(raw: unknown): number | null {
  return Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= SESSIONS_MAX ? raw as number : null
}

/** A Session as the Event holds it: its id, its set Date (null while it waits for one) and when the Host started it (null until then, #164). */
export interface SessionDate {
  id: string
  startsAt: Date | null
  startedAt: Date | null
}

/** Whether the Host has started the Session (#164). */
export function isStarted<S extends { startedAt: Date | null }>(session: S): session is S & { startedAt: Date } {
  return session.startedAt !== null
}

/** Whether the Session has its Date. */
export function isDated<S extends { startsAt: Date | null }>(session: S): session is S & { startsAt: Date } {
  return session.startsAt !== null
}

/**
 * The Sessions with the number they are shown with (#49, #53, #70, #164): the started ones first, in the order they
 * started, then the dated ones that have not started, in Date order, then the ones still waiting for a Date, in the
 * given order. They are numbered 1…n down that list, but only while the Event has several Sessions: a single Session
 * has nothing to tell apart, so it is shown without a number. A Session without a Date that has not started has no
 * number. Once a Session has started its number never changes: a start picks the earliest dated Session, which
 * already holds the next number, and a Date set or moved later only reorders the Sessions behind the started ones.
 * Equal Dates (and equal starts) keep their given order. The Event page, Home and the calendar title all show this
 * number, and sequenceRaises compares it.
 */
export function numberedSessions<S extends SessionDate>(sessions: S[]): (S & { number: number | null })[] {
  const several = sessions.length > 1
  // Array sort is stable, so equal times keep their given order.
  const started = sessions.filter(isStarted).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const waiting = sessions.filter(session => session.startedAt === null)
  const dated = waiting.filter(isDated).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  const numbered = [...started, ...dated].map((session, index) => ({ ...session, number: several ? index + 1 : null }))
  return [...numbered, ...waiting.filter(session => session.startsAt === null).map(session => ({ ...session, number: null }))]
}

/** How many Sessions still wait for a Date. */
export function missingDates(startsAt: (Date | null)[]): number {
  return startsAt.filter(date => date === null).length
}

/**
 * The open Date poll of an Event (#52, #71): its open Slots and the Votes on them. A Slot is open when no
 * Session refers to it, because its Date came from that Slot; a taken Slot leaves the poll with its Votes.
 * `sessionSlotIds` are the Slot ids the Sessions refer to (null for none). Order is kept. The Event read and
 * Home call this before pollStanding, which counts only what it is given.
 */
export function openPoll<S extends { id: string }, V extends { slotId: string }>(slots: S[], sessionSlotIds: (string | null)[], votes: V[]): { slots: S[], votes: V[] } {
  const taken = new Set(sessionSlotIds.filter((id): id is string => id !== null))
  const open = slots.filter(slot => !taken.has(slot.id))
  const openIds = new Set(open.map(slot => slot.id))
  return { slots: open, votes: votes.filter(vote => openIds.has(vote.slotId)) }
}

/** Whether a Session other than `exceptId` has this instant as its set Date (#49: Dates are distinct). */
export function hasDateAt(sessions: Pick<SessionDate, 'id' | 'startsAt'>[], instant: Date, exceptId?: string): boolean {
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
