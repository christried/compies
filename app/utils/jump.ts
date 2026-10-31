import { reducedMotion } from './motion'

// Jumps on the Event page (#166, 11-event-seite § EventPage › Accessibility): the Head's link and the Sessions card's
// „Zur Umfrage“ / „Abstimmen“ scroll to the heading of a Session's Date poll and move focus to it.

/** The id of the heading of the Date poll for the Session with this shown number; the only Session of an Event has none, so it is 1. */
export function pollHeadingId(number: number | null): string {
  return `poll-session-${number ?? 1}`
}

/** Scrolls to the element with this id (smooth unless motion is reduced) and focuses it; the element has `tabindex="-1"`. */
export function jumpTo(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}
