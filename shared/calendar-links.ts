import { SESSION_DURATION_MS } from './event'

// „Google Kalender“ and „Outlook“ in the calendar sheet (#81): addresses that open a new, pre-filled event in that
// calendar. Pure: the sheet passes in the calendar file's own title and description and the Session's Date. The
// entry ends SESSION_DURATION_MS after its start, as in the calendar file. Times are UTC.

export interface CalendarEntry {
  title: string
  description: string
  startsAt: Date
}

export interface CalendarLinks {
  google: string
  outlook: string
}

/** An instant as the UTC form `YYYYMMDDTHHmmssZ`. */
function compactUtc(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** An instant as the UTC form `YYYY-MM-DDTHH:mm:ssZ`. */
function isoUtc(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** A query string with every value percent-encoded as UTF-8. */
function query(params: Record<string, string>): string {
  return Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
}

export function calendarLinks(entry: CalendarEntry): CalendarLinks {
  const end = new Date(entry.startsAt.getTime() + SESSION_DURATION_MS)
  const google = query({
    action: 'TEMPLATE',
    text: entry.title,
    dates: `${compactUtc(entry.startsAt)}/${compactUtc(end)}`,
    details: entry.description,
  })
  // Outlook.com only: Microsoft 365 work and school accounts are not served; they take the calendar file.
  const outlook = query({
    rru: 'addevent',
    subject: entry.title,
    startdt: isoUtc(entry.startsAt),
    enddt: isoUtc(end),
    body: entry.description,
  })
  return {
    google: `https://calendar.google.com/calendar/render?${google}`,
    outlook: `https://outlook.live.com/calendar/0/action/compose?${outlook}`,
  }
}
