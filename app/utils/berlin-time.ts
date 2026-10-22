// Display and input helpers for Europe/Berlin (ADR 0003). Times are UTC on the wire; the browser
// shows Berlin wall-clock time whatever its own zone is.

const ZONE = 'Europe/Berlin'

const dayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, weekday: 'short', day: '2-digit', month: '2-digit' })
const timeFormat = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const wallClockFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** A Slot's day as `Sa 24.10.` (Berlin). */
export function formatSlotDay(instant: Date): string {
  const parts = Object.fromEntries(dayFormat.formatToParts(instant).map(part => [part.type, part.value]))
  // de-DE abbreviates the weekday with a period ("Sa."); the design shows it without.
  return `${(parts.weekday ?? '').replace(/\.$/, '')} ${parts.day}.${parts.month}.`
}

/** A Slot's time as `20:30` (Berlin). */
export function formatSlotTime(instant: Date): string {
  return timeFormat.format(instant)
}

/** The Berlin wall-clock time at `instant`, minute precision, in the `YYYY-MM-DDTHH:mm` form a datetime field uses. */
export function berlinLocalNow(instant: Date = new Date()): string {
  const parts = Object.fromEntries(wallClockFormat.formatToParts(instant).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
