import type { EventView } from '~~/shared/event'
import { MEMBER_TOUR, TOUR_CALM_MS, TOUR_VERSION, tourMayStart, tourRun, type TourStartInput, type TourStep } from '~~/shared/tour'

// The Tour's running on a page (#647, spec #622, ADR 0017): when it starts, when it ends by itself, and what finishing or skipping saves. The rules
// are `shared/tour.ts`'s pure functions; this reads their inputs from the page. Each device decides for itself and nothing goes to the room (ADR 0013):
// no instant is stored, no message sent.

/** The `data-tour` values of what can be seen now. The side panel is `display: none` below md, as `useDropdownMenu.menuItems` handles the same case. */
function tourPresent(): Set<string> {
  const present = new Set<string>()
  for (const element of document.querySelectorAll<HTMLElement>('[data-tour]')) {
    if (element.checkVisibility?.() ?? true) present.add(element.dataset.tour!)
  }
  return present
}

/**
 * Whether the Tour is `shown` and the `run` it holds. It starts once, when the page has been calm for TOUR_CALM_MS (no sheet, dialog, menu or
 * Clip open: any of them opening starts the wait again) and the rule says so. It ends by itself, unseen, when the rule stops holding: a Session starts,
 * the Event finishes or goes away, a layer opens. Once it ended in this mount it does not start again (`done`): a Session that ends mid-game
 * would bring it back otherwise. A reload or another visit starts afresh. `over` is finishing and skipping: seen at once, saved in the background.
 */
export function useTour(options: {
  steps?: readonly TourStep[]
  view: () => EventView | null | undefined
  clipShown: () => boolean
  wide: () => boolean
}) {
  const steps = options.steps ?? MEMBER_TOUR
  const user = useAuthUser()
  const { busy } = useOpenLayers()

  const shown = ref(false)
  const run = ref<readonly TourStep[]>([])
  const calmFor = ref(0)
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const layerOpen = computed(() => busy.value || options.clipShown())
  const input = computed<TourStartInput>(() => {
    const view = options.view()
    return {
      storedVersion: user.value?.tourSeen ?? null,
      role: view?.event.isHost ? 'host' : 'member',
      phase: view?.event.phase ?? null,
      sessionRunning: view ? view.runningSessionId !== null : false,
      layerOpen: layerOpen.value,
      calmFor: calmFor.value,
    }
  })

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  // The calm second runs on the client only, from mount: any layer opening resets the wait.
  onMounted(() => {
    watch(() => !layerOpen.value, (calm) => {
      clearTimer()
      calmFor.value = 0
      if (calm) timer = setTimeout(() => void (calmFor.value = TOUR_CALM_MS), TOUR_CALM_MS)
    }, { immediate: true })
  })
  onBeforeUnmount(clearTimer)

  watch(input, (now) => {
    if (shown.value) {
      // A shown Tour has had its calm second: only the other conditions end it, and it saves nothing.
      if (!tourMayStart({ ...now, calmFor: TOUR_CALM_MS })) {
        shown.value = false
        done = true
      }
      return
    }
    if (done || !tourMayStart(now)) return
    // An empty run starts nothing and latches nothing: it stays unseen (#648 adds the steps that can come to nothing).
    const starting = tourRun(steps, { phase: now.phase!, role: now.role, present: tourPresent(), wide: options.wide() })
    if (starting.length === 0) return
    run.value = starting
    shown.value = true
  })

  function over() {
    if (!shown.value) return
    // Closed and latched first, so the end rule does not read the stored version that changes next.
    shown.value = false
    done = true
    const current = user.value
    if (!current) return
    // Seen at once and never lowered, like the server (useNewsSeen.markSeen); the save runs in the background and is never awaited.
    user.value = { ...current, tourSeen: Math.max(current.tourSeen, TOUR_VERSION) }
    void save()
  }

  async function save() {
    try {
      await $fetch('/api/me/tour-seen', { method: 'POST', body: { version: TOUR_VERSION } })
    }
    catch {
      // The client stays „seen“ until the next page load, whose `GET /api/me` brings the server's number back: the Tour shows again at the next visit.
    }
  }

  return { shown, run, over }
}
