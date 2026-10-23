// The calendar file a Member downloads for a Date (#1 § Domain rules, ADR 0003). One event per
// Event: the UID is stable per Event and SEQUENCE is the Event's icsSequence, so a Reschedule
// updates the same event in the calendar. Times are UTC. The builder is pure: the endpoint passes in
// the copy (from de.json) and the current time.

/** The event lasts 7 h (code constant, #1). */
export const ICS_DURATION_MS = 7 * 60 * 60_000

export interface IcsInput {
  /** Stable per Event. */
  uid: string
  /** The Event's `icsSequence`. */
  sequence: number
  startsAt: Date
  /** DTSTAMP: when the file is made. */
  now: Date
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

/** The whole calendar file, CRLF line endings, one VEVENT with a display alarm one hour before. */
export function buildIcs(input: IcsInput): string {
  const end = new Date(input.startsAt.getTime() + ICS_DURATION_MS)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//COMPIES//MVP Terminfindung//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${utcStamp(input.now)}`,
    `DTSTART:${utcStamp(input.startsAt)}`,
    `DTEND:${utcStamp(end)}`,
    `SEQUENCE:${input.sequence}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
    `URL:${input.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(input.alarm)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.flatMap(fold).join('\r\n')}\r\n`
}
