// The key of an Event's read (`GET /api/e/<slug>`), shared by the Event page and the settings editor (#174). An
// unnamed useFetch is keyed by its call site, so the two pages had two caches: a save refreshed the editor's and left
// the Event page showing the old settings until its next poll. With one key, `refreshNuxtData` reaches both.
export function eventDataKey(slug: string): string {
  return `event-${slug}`
}

// The key of Home's list (`GET /api/e`), shared by Home and the 404 page (#12). The Host's delete drops it, so the Event is gone from
// the list on arrival (#333).
export const HOME_EVENTS_KEY = 'home-events'

// The key of the Archive's list (`GET /api/archive`, #882), as Home's: one cache for the page, so a return refetches the same data.
export const ARCHIVE_KEY = 'archive'

// The key of the Admin page's read (`GET /api/admin`, #682): one cache for the page and for the refetch after each write.
export const ADMIN_KEY = 'admin'
