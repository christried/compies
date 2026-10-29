// The key of an Event's read (`GET /api/e/<slug>`), shared by the Event page and the settings editor (#174). An
// unnamed useFetch is keyed by its call site, so the two pages had two caches: a save refreshed the editor's and left
// the Event page showing the old settings until its next poll. With one key, `refreshNuxtData` reaches both.
export function eventDataKey(slug: string): string {
  return `event-${slug}`
}
