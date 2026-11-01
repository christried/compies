/**
 * How long after an instant the page waits before it reads again (#229): the page's server clock is an estimate, and a read
 * that reached the server a hair before the instant would settle nothing and leave the page as it was.
 */
export const INSTANT_MARGIN_MS = 250

/**
 * Reads again when an instant the page knows passes (#229, spec #218 § Deadlines: no timer runs on the server, the first read or
 * write after an instant settles it, so the clients are the ones who come back at it). The wheel's stop, and later the end of a
 * Veto window, a coin's landing: whoever knows an instant gives it here and `onPassed` refetches what the instant changes
 * (the Event read and the Activity feed). `instants` are server time in epoch ms, as `serverNow()` counts them; they may change
 * (a new spin adds one, a settled draw drops its own). One timer waits for the next instant and is armed again when the instants
 * change; each instant calls `onPassed` once, `INSTANT_MARGIN_MS` after it. An instant that had passed when the page first saw
 * it is not waited for: the read it came with is up to date. When the tab comes back it catches up on the instants its
 * sleeping timers missed. The timer and the listener stop when the page's scope ends. Nothing runs on the server.
 */
export function useInstantRefresh(instants: MaybeRefOrGetter<readonly number[]>, serverNow: () => number, onPassed: () => void) {
  if (!import.meta.client) return

  /** The instants that have not passed yet. */
  const pending = new Set<number>()
  let timer: ReturnType<typeof setTimeout> | undefined

  /** Calls `onPassed` once for the instants that have passed, then waits for the next one. */
  function arm() {
    clearTimeout(timer)
    const now = serverNow()
    const passed = [...pending].filter(at => at + INSTANT_MARGIN_MS <= now)
    for (const at of passed) pending.delete(at)
    if (passed.length > 0) onPassed()
    if (pending.size > 0) timer = setTimeout(arm, Math.min(...pending) + INSTANT_MARGIN_MS - now)
  }

  watch(() => [...toValue(instants)], (known) => {
    const now = serverNow()
    for (const at of pending) if (!known.includes(at)) pending.delete(at)
    for (const at of known) if (at + INSTANT_MARGIN_MS > now) pending.add(at)
    arm()
  }, { immediate: true })

  const onVisibility = () => {
    if (document.visibilityState === 'visible') arm()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onScopeDispose(() => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })
}
