// The key of an Event's read (`GET /api/e/<slug>`), shared by the Event page and the settings editor (#174). An
// unnamed useFetch is keyed by its call site, so the two pages had two caches: a save refreshed the editor's and left
// the Event page showing the old settings until its next poll. With one key, `refreshNuxtData` reaches both.
export function eventDataKey(slug: string): string {
  return `event-${slug}`
}

// The key of Home's list (`GET /api/e`), shared by Home and the 404 page (#12). The Host's delete drops it, so the Event is gone from
// the list on arrival (#333).
export const HOME_EVENTS_KEY = 'home-events'
