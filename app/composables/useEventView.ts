import { POLL_INTERVAL_MS } from '~/composables/usePollRefresh'
import { eventDataKey } from '~/utils/event-data'
import type { EventView } from '~~/shared/event'

/**
 * The one owner of the Event read (`GET /api/e/<slug>`, #156, review 1.3 Part 4 row 5): the Event page and the settings
 * editor both take their Event from here. It loads the Event under the shared key (`eventDataKey`), opens the Event's
 * live room, and refetches when the room says something changed (`event.changed`) and on every open of the connection,
 * first connect and reconnect alike, because a message sent while the socket was down is gone. The page refetches on
 * every return too (the tab visible again, window focus, `online`), whatever the room says (#198). The 15 s polling
 * (ADR 0001, while the tab is visible) runs only while the room is not open. Only a loaded Event is refetched: a link
 * that failed keeps its error page.
 *
 * Like `useFetch` it can be awaited (the page then waits for the first read) and used without awaiting. Everything
 * that needs the component is registered before the first await, which would lose it.
 */
export function useEventView(slug: MaybeRefOrGetter<string>) {
  const room = useEventRoom(slug)
  const fetched = useFetch<EventView>(() => `/api/e/${toValue(slug)}`, { key: () => eventDataKey(toValue(slug)) })
  const { data, error, refresh } = fetched

  const refreshLoaded = () => {
    if (data.value) void refresh()
  }
  room.on('event.changed', refreshLoaded)
  watch(room.state, (state) => {
    if (state === 'open') refreshLoaded()
  })
  usePollRefresh(refreshLoaded, POLL_INTERVAL_MS, () => room.state.value !== 'open')

  const view = { data, error, refresh, room }
  return Object.assign(fetched.then(() => view), view)
}

/** Refetches an Event's read under the shared key (`eventDataKey`), for a component that changed something on the page and has no `refresh` of its own (#237, review 1.4 N11). */
export function refreshEvent(slug: string) {
  return refreshNuxtData(eventDataKey(slug))
}
