import type { VetoDrawView } from '~~/shared/event'

/** How often the Veto window's clock looks at the server's time. */
const TICK_MS = 250

/**
 * The clock of a Veto window (#231, review 0.7 F4): when it is open and how long it has left, from the server's time. The inline
 * window (VetoWindow) and the fixed bar (VetoBar) both run on it. Before the page has mounted nothing is open, so the server's
 * render and the first client render agree. `draw` is the window's draw (`wheel.vetoes.draw`), null when the latest draw has none.
 */
export function useVetoClock(draw: () => VetoDrawView | null, serverNow: () => number) {
  const mounted = ref(false)
  const now = ref(0)
  let interval: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    mounted.value = true
    now.value = serverNow()
    interval = setInterval(() => void (now.value = serverNow()), TICK_MS)
  })
  onBeforeUnmount(() => clearInterval(interval))

  const stopAt = computed(() => {
    const current = draw()
    return current ? Date.parse(current.stopAt) : 0
  })
  const endsAt = computed(() => {
    const current = draw()
    return current ? Date.parse(current.vetoEndsAt) : null
  })
  /** The window is open: after the stop, before its end. */
  const open = computed(() => mounted.value && endsAt.value !== null && now.value >= stopAt.value && now.value < endsAt.value)
  const msLeft = computed(() => (endsAt.value === null ? 0 : Math.max(0, endsAt.value - now.value)))
  const secondsLeft = computed(() => Math.ceil(msLeft.value / 1000))

  return { mounted, now, endsAt, open, msLeft, secondsLeft }
}
