// Display helpers for Europe/Berlin (ADR 0003). Times are UTC on the wire; the browser shows Berlin
// wall-clock time whatever its own zone is. The conversion for form values is shared/time.ts.
import { BERLIN_ZONE, berlinDay } from '~~/shared/time'

const timeFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const longDayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
const monthFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, month: 'long', year: 'numeric' })

/** A Slot's day as `Sa 24.10.` (Berlin). */
export function formatSlotDay(instant: Date): string {
  return berlinDay(instant, false)
}

/** A month and year as `Oktober 2026` (Berlin), for „angelegt im …“. */
export function formatMonthYear(instant: Date): string {
  return monthFormat.format(instant)
}

/** A Slot's time as `20:30` (Berlin). */
export function formatSlotTime(instant: Date): string {
  return timeFormat.format(instant)
}

/** A Date's day as `Samstag, 24. Oktober` (Berlin), for the Date set card. */
export function formatSetDay(instant: Date): string {
  return longDayFormat.format(instant)
}

/** A Slot as the cards and lists show it: `Sa 24.10. 20:30` (Berlin). */
export function formatSlotWhen(instant: Date): string {
  return `${formatSlotDay(instant)} ${formatSlotTime(instant)}`
}

/** When an Activity feed entry happened (#159): `20:30` on the day of `now`, else the day with the time (Berlin). */
export function formatActivityTime(instant: Date, now: Date): string {
  return formatSlotDay(instant) === formatSlotDay(now) ? formatSlotTime(instant) : formatSlotWhen(instant)
}

/** A Session's Date as the Event page's Head and rows show it: `Sa 25.10., 20:30` (Berlin). */
export function formatSessionWhen(instant: Date): string {
  return `${formatSlotDay(instant)}, ${formatSlotTime(instant)}`
}
