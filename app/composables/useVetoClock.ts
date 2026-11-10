import { windowEnded, windowFraction, windowOpen } from '~~/shared/draw-timeline'
import type { VetoDrawView } from '~~/shared/stage'

/**
 * The clock of a Veto window (#231, review 0.7 F4): when it is open or ended, how much is left and how long, from the server's time.
 * What open and ended mean is the Draw timeline's (shared/draw-timeline.ts, #414). The inline window (VetoWindow) and the fixed bar
 * (VetoBar) both run on it, on the server ticker (#257) that reads the time every frame until the window's end (04-motion:
 * countdowns render every frame). Before the page has mounted nothing is open or ended, so the server's render and the first client
 * render agree. `draw` is the window's draw (`wheel.vetoes.draw`), null when the latest draw has none. `fraction` runs from 1 at the
 * stop to 0 at the end of the Draw's own window. A fixed bar and a window that comes and goes have nothing stable to watch, so the
 * clock does not pause out of view.
 */
export function useVetoClock(draw: () => VetoDrawView | null, serverNow: () => number) {
  const endsAt = computed(() => {
    const current = draw()
    return current ? Date.parse(current.vetoEndsAt) : null
  })
  const ticker = useServerTicker(serverNow, { until: () => endsAt.value })
  const mounted = computed(() => ticker.value !== null)
  /** Server time in epoch ms; 0 before the page has mounted. */
  const now = computed(() => ticker.value ?? 0)
  /** The window is open: after the stop, before its end. */
  const open = computed(() => {
    const current = draw()
    return mounted.value && current !== null && windowOpen(current, now.value)
  })
  /** The window has ended. */
  const ended = computed(() => {
    const current = draw()
    return mounted.value && current !== null && windowEnded(current, now.value)
  })
  const msLeft = computed(() => (endsAt.value === null ? 0 : Math.max(0, endsAt.value - now.value)))
  const secondsLeft = computed(() => Math.ceil(msLeft.value / 1000))
  /** How much of the window is left, 1 to 0, from the Draw's own instants. */
  const fraction = computed(() => {
    const current = draw()
    return current === null ? 0 : windowFraction(current, now.value)
  })

  return { open, ended, secondsLeft, fraction }
}
