import type { VetoDrawView } from '~~/shared/stage'

/**
 * The clock of a Veto window (#231, review 0.7 F4): when it is open and how long it has left, from the server's time. The inline
 * window (VetoWindow) and the fixed bar (VetoBar) both run on it, on the server ticker (#257) that reads the time every frame until the
 * window's end (04-motion: countdowns render every frame). Before the page has mounted nothing is open, so the server's render and the
 * first client render agree. `draw` is the window's draw (`wheel.vetoes.draw`), null when the latest draw has none. A fixed bar and a
 * window that comes and goes have nothing stable to watch, so the clock does not pause out of view.
 */
export function useVetoClock(draw: () => VetoDrawView | null, serverNow: () => number) {
  const stopAt = computed(() => {
    const current = draw()
    return current ? Date.parse(current.stopAt) : 0
  })
  const endsAt = computed(() => {
    const current = draw()
    return current ? Date.parse(current.vetoEndsAt) : null
  })
  const ticker = useServerTicker(serverNow, { until: () => endsAt.value })
  const mounted = computed(() => ticker.value !== null)
  /** Server time in epoch ms; 0 before the page has mounted. */
  const now = computed(() => ticker.value ?? 0)
  /** The window is open: after the stop, before its end. */
  const open = computed(() => mounted.value && endsAt.value !== null && now.value >= stopAt.value && now.value < endsAt.value)
  const msLeft = computed(() => (endsAt.value === null ? 0 : Math.max(0, endsAt.value - now.value)))
  const secondsLeft = computed(() => Math.ceil(msLeft.value / 1000))

  return { mounted, now, endsAt, open, msLeft, secondsLeft }
}
