/**
 * How long after an instant the page waits before it reads again (#229): the page's server clock is an estimate, and a read
 * that reached the server a hair before the instant would settle nothing and leave the page as it was.
 */
export const INSTANT_MARGIN_MS = 250

/** How often the page reads again while a passed instant is still unsettled in the read, and how many times at most (review 0.7, F13). */
export const SETTLE_RETRY_MS = 500
export const SETTLE_RETRY_MAX = 3

/**
 * Reads again when an instant the page knows passes (#229, spec #218 § Deadlines: no timer runs on the server, the first read or
 * write after an instant settles it, so the clients are the ones who come back at it). The wheel's stop, and later the end of a
 * Veto window, a coin's landing: whoever knows an instant gives it here and `onPassed` refetches what the instant changes
 * (the Event read and the Activity feed). `instants` are server time in epoch ms, as `serverNow()` counts them; they may change
 * (a new spin adds one, a settled draw drops its own). One timer waits for the next instant and is armed again when the instants
 * change; each instant calls `onPassed` once, `INSTANT_MARGIN_MS` after it. An instant that had passed when the page first saw
 * it is not waited for: the read it came with is up to date. When the tab comes back it catches up on the instants its
 * sleeping timers missed. The timer and the listener stop when the page's scope ends. Nothing runs on the server.
 * A read can reach the server a hair early or lag behind, and answer the page unsettled (a stop without its game, a window's end
 * without its Vetoes). `unsettled` says so about the current read: while it holds after a read that an instant fired, the page
 * reads again every SETTLE_RETRY_MS, at most SETTLE_RETRY_MAX times (F13).
 */
export function useInstantRefresh(instants: MaybeRefOrGetter<readonly number[]>, serverNow: () => number, onPassed: () => void, unsettled?: () => boolean) {
  if (!import.meta.client) return

  /** The instants that have not passed yet. */
  const pending = new Set<number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  /** Looks again after SETTLE_RETRY_MS: while the read is unsettled it reads once more, up to the cap. A new fire starts the count over. */
  function retry(attempt: number) {
    clearTimeout(retryTimer)
    if (!unsettled || attempt >= SETTLE_RETRY_MAX) return
    retryTimer = setTimeout(() => {
      if (!unsettled()) return
      onPassed()
      retry(attempt + 1)
    }, SETTLE_RETRY_MS)
  }

  /** Calls `onPassed` once for the instants that have passed, then waits for the next one. */
  function arm() {
    clearTimeout(timer)
    const now = serverNow()
    const passed = [...pending].filter(at => at + INSTANT_MARGIN_MS <= now)
    for (const at of passed) pending.delete(at)
    if (passed.length > 0) {
      onPassed()
      retry(0)
    }
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
    clearTimeout(retryTimer)
    document.removeEventListener('visibilitychange', onVisibility)
  })
}
