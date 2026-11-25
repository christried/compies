import { apiFailure } from '~/utils/api-error'
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
 * A later read that answers 404 or 410, or the room's `event.gone` (#917), ends the Event for this page (#914, ADR 0006): `data` is gone, `error` says
 * the status (410 for the message), and the room stops, so nothing reads or connects any more. Any other failed later read keeps the Event
 * on screen: Nuxt clears the data of a failed read, so the Event last loaded is kept here. The room's `member.removed` (#897, the Host removed this User)
 * ends the Event the same way and outranks all of it: `removed` is true and the page shows the notice instead of a 404 or 410 state.
 *
 * Like `useFetch` it can be awaited (the page then waits for the first read) and used without awaiting. Everything
 * that needs the component is registered before the first await, which would lose it.
 */
export function useEventView(slug: MaybeRefOrGetter<string>) {
  const room = useEventRoom(slug)
  const fetched = useFetch<EventView>(() => `/api/e/${toValue(slug)}`, { key: () => eventDataKey(toValue(slug)) })
  const { data: fetchedData, error: fetchedError, refresh } = fetched

  const lastLoaded = shallowRef<EventView>()
  watch(fetchedData, (loadedView) => {
    if (loadedView) lastLoaded.value = loadedView
  }, { immediate: true, flush: 'sync' })

  // The Host deleted their account: the room says the Event's rows are gone (#917, ADR 0020). Sticky, so a read in flight that resolves after the message, with data
  // or with an error, changes nothing; the room stops below and is never opened again for this page.
  const goneByRoom = ref(false)
  room.on('event.gone', () => {
    goneByRoom.value = true
  })
  const goneStatus = computed(() => {
    if (goneByRoom.value) return 410
    const status = apiFailure(fetchedError.value).status
    return status === 404 || status === 410 ? status : null
  })
  // The Host removed this User (#897, ADR 0006): the room sends `member.removed` to their sockets only. Sticky and above everything else the page can end on: a read in flight, a 404
  // (already „Link ungültig“), a 410, an `event.gone` or a failed read change nothing once it came. A removed User's reads answer 404, so `error` says 404 and the page tells why.
  const removedByRoom = ref(false)
  room.on('member.removed', () => {
    removedByRoom.value = true
  })
  const ended = computed(() => removedByRoom.value || goneStatus.value !== null)
  const data = computed(() => (ended.value ? undefined : (fetchedData.value ?? lastLoaded.value)))
  const error = computed(() => {
    if (removedByRoom.value) return { statusCode: 404 }
    return goneStatus.value ? { statusCode: goneStatus.value } : fetchedError.value
  })
  watch(ended, (isEnded) => {
    if (isEnded) room.stop()
  })

  const refreshLoaded = () => {
    if (lastLoaded.value && !ended.value) void refresh()
  }
  room.on('event.changed', refreshLoaded)
  watch(room.state, (state) => {
    if (state === 'open') refreshLoaded()
  })
  usePollRefresh(refreshLoaded, POLL_INTERVAL_MS, () => room.state.value !== 'open')

  const view = { data, error, refresh, room, removed: readonly(removedByRoom) }
  return Object.assign(fetched.then(() => view), view)
}

/** Refetches an Event's read under the shared key (`eventDataKey`), for a component that changed something on the page and has no `refresh` of its own (#237, review 1.4 N11). */
export function refreshEvent(slug: string) {
  return refreshNuxtData(eventDataKey(slug))
}
