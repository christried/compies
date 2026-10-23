// The calendar file a Member downloads for an Event (#1 § Domain rules, ADR 0003, #53). One VEVENT per
// Session with a Date: the UID is stable per Session and SEQUENCE is the Session's icsSequence, so a
// Reschedule updates the same entry in the calendar. Times are UTC. The builders are pure: the endpoint
// passes in the copy (from de.json) and the current time.

import { sessionNumbers } from './session'

/** The event lasts 7 h (code constant, #1). */
export const ICS_DURATION_MS = 7 * 60 * 60_000

export interface IcsEntry {
  /** Stable per Session. */
  uid: string
  /** The Session's `icsSequence`. */
  sequence: number
  startsAt: Date
  summary: string
  description: string
  /** The text the 1 h alarm shows. */
  alarm: string
  /** The Event link. */
  url: string
}

/**
 * Fills the `{name}` placeholders of a de.json text. The values go in through a function, so `$&`,
 * `$'` and the like in an Event name stay as typed instead of being read as replacement patterns.
 */
export function fillCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder)
}

const encoder = new TextEncoder()

/** An instant as the UTC form `YYYYMMDDTHHmmssZ`. */
function utcStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** Escapes a text value per RFC 5545 section 3.3.11. Backslash goes first. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Folds a content line at 75 octets; continuation lines start with a space. Never splits a character. */
function fold(line: string): string[] {
  const segments: string[] = []
  let current = ''
  let octets = 0
  let limit = 75
  for (const character of line) {
    const size = encoder.encode(character).length
    if (octets + size > limit) {
      segments.push(current)
      current = ''
      octets = 0
      limit = 74
    }
    current += character
    octets += size
  }
  segments.push(current)
  return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`))
}

/** The VEVENT lines of one entry, with a display alarm one hour before the start. */
function eventLines(entry: IcsEntry, now: Date): string[] {
  const end = new Date(entry.startsAt.getTime() + ICS_DURATION_MS)
  return [
    'BEGIN:VEVENT',
    `UID:${entry.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(entry.startsAt)}`,
    `DTEND:${utcStamp(end)}`,
    `SEQUENCE:${entry.sequence}`,
    `SUMMARY:${escapeText(entry.summary)}`,
    `DESCRIPTION:${escapeText(entry.description)}`,
    `URL:${entry.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(entry.alarm)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
  ]
}

/** The whole calendar file, CRLF line endings, one VEVENT per entry in the order given. */
export function buildIcs(entries: IcsEntry[], now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//COMPIES//MVP Terminfindung//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...entries.flatMap(entry => eventLines(entry, now)),
    'END:VCALENDAR',
  ]
  return `${lines.flatMap(fold).join('\r\n')}\r\n`
}

/** A Session as the calendar sees it: its id, its Date (null while undated) and its icsSequence. */
export interface CalendarSession {
  id: string
  startsAt: Date | null
  icsSequence: number
}

/** The de.json strings the entries are built from. `{event}`, `{n}` and `{url}` are filled in. */
export interface CalendarCopy {
  summary: string
  sessionSummary: string
  description: string
  alarm: string
}

/**
 * One entry per Session with a Date, in Date order (#53). The title names the Session's number only when
 * the Event has more than one Session. Undated Sessions get no entry, so an Event with no Date has none.
 */
export function sessionEntries(input: { eventName: string, url: string, sessions: CalendarSession[], copy: CalendarCopy }): IcsEntry[] {
  const numbers = sessionNumbers(input.sessions.map(session => session.startsAt))
  const description = fillCopy(input.copy.description, { url: input.url })
  const alarm = fillCopy(input.copy.alarm, { event: input.eventName })
  return input.sessions
    .map((session, index) => ({ session, number: numbers[index] ?? null }))
    .filter((entry): entry is { session: CalendarSession & { startsAt: Date }, number: number } => entry.session.startsAt !== null && entry.number !== null)
    .sort((a, b) => a.number - b.number)
    .map(({ session, number }) => ({
      uid: `${session.id}@compies`,
      sequence: session.icsSequence,
      startsAt: session.startsAt,
      summary: input.sessions.length === 1
        ? fillCopy(input.copy.summary, { event: input.eventName })
        : fillCopy(input.copy.sessionSummary, { event: input.eventName, n: String(number) }),
      description,
      alarm,
      url: input.url,
    }))
}
