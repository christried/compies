// Display helpers for Europe/Berlin (ADR 0003). Times are UTC on the wire; the browser shows Berlin
// wall-clock time whatever its own zone is. The conversion for form values is shared/time.ts.
import { BERLIN_ZONE } from '~~/shared/time'

const dayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' })
const timeFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const longDayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
const monthFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, month: 'long', year: 'numeric' })
const tileFormat = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_ZONE, weekday: 'short', day: '2-digit', month: 'short' })

/** A Slot's day as `Sa 24.10.` (Berlin). */
export function formatSlotDay(instant: Date): string {
  const parts = Object.fromEntries(dayFormat.formatToParts(instant).map(part => [part.type, part.value]))
  // de-DE abbreviates the weekday with a period ("Sa."); the design shows it without.
  return `${(parts.weekday ?? '').replace(/\.$/, '')} ${parts.day}.${parts.month}.`
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

/** The Date set card's calendar tile (Berlin): `Sa`, `Okt`, `24` and `20:30`. */
export function formatDateTile(instant: Date): { weekday: string, month: string, day: string, time: string } {
  const parts = Object.fromEntries(tileFormat.formatToParts(instant).map(part => [part.type, part.value]))
  return {
    weekday: (parts.weekday ?? '').replace(/\.$/, ''),
    month: (parts.month ?? '').replace(/\.$/, ''),
    day: parts.day ?? '',
    time: formatSlotTime(instant),
  }
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
