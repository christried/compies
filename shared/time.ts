// Every time a User enters or reads is Europe/Berlin, hard-coded; storage is UTC (ADR 0003). The one
// conversion between the two, shared by the server and the forms in the app.
const ZONE = 'Europe/Berlin'
// Far enough from a DST change to read the offset in force on either side of it.
const DST_PROBE_MS = 6 * 60 * 60_000

const wallClockFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** The zero-padded Berlin wall-clock fields at `instant`. */
function wallClockParts(instant: number) {
  const fields = Object.fromEntries(wallClockFormat.formatToParts(instant).map(part => [part.type, part.value]))
  return { year: fields.year!, month: fields.month!, day: fields.day!, hour: fields.hour!, minute: fields.minute! }
}

/** Reads wall-clock fields as if they were UTC, giving a number to do offset arithmetic on. */
function wallClockAsUtcMs(fields: ReturnType<typeof wallClockParts>): number {
  return Date.UTC(+fields.year, +fields.month - 1, +fields.day, +fields.hour, +fields.minute)
}

/** Berlin's offset from UTC at `instant`, in minutes (60 in winter, 120 in summer). */
function berlinOffsetMinutes(instant: number): number {
  return (wallClockAsUtcMs(wallClockParts(instant)) - Math.floor(instant / 60_000) * 60_000) / 60_000
}

/** A Berlin wall-clock time `YYYY-MM-DDTHH:mm` (the value of a datetime-local input) as an instant. */
export function berlinToUtc(local: string): Date {
  const [date, time] = local.split('T')
  const [year, month, day] = date!.split('-')
  const [hour, minute] = time!.split(':')
  const wallClock = wallClockAsUtcMs({ year: year!, month: month!, day: day!, hour: hour!, minute: minute! })
  // Around a DST change the wall clock can match two instants (fall back) or none (spring forward).
  // Try the offsets in force shortly before and after, earliest instant first.
  const offsetBefore = berlinOffsetMinutes(wallClock - DST_PROBE_MS)
  const offsetAfter = berlinOffsetMinutes(wallClock + DST_PROBE_MS)
  const matchingInstant = [Math.max(offsetBefore, offsetAfter), Math.min(offsetBefore, offsetAfter)]
    .map(offset => wallClock - offset * 60_000)
    .find(instant => wallClock - berlinOffsetMinutes(instant) * 60_000 === instant)
  // A skipped time keeps the offset from before the change, so 02:30 lands on 03:30 summer time.
  return new Date(matchingInstant ?? wallClock - offsetBefore * 60_000)
}

/** A Berlin wall-clock value `YYYY-MM-DDTHH:mm` split into its date and time parts (each '' when missing). */
export function splitBerlinLocal(local: string): { date: string, time: string } {
  const [date = '', time = ''] = local.split('T')
  return { date, time }
}

/** The Berlin wall-clock value `YYYY-MM-DDTHH:mm` from its date and time parts, the inverse of `splitBerlinLocal`. */
export function joinBerlinLocal(date: string, time: string): string {
  return `${date}T${time}`
}

/** An instant as Berlin wall-clock time `YYYY-MM-DDTHH:mm`, the inverse of `berlinToUtc`. */
export function utcToBerlin(instant: Date): string {
  const { year, month, day, hour, minute } = wallClockParts(instant.getTime())
  return `${year}-${month}-${day}T${hour}:${minute}`
}
