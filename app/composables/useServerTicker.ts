import type { WatchSource } from 'vue'
import { serverClockReadyKey } from '~/composables/useServerClock'

export interface ServerTickerOptions {
  /** The server time (epoch ms) at which nothing is pending any more, or null when nothing is. Reactive: it is read inside a watch. */
  until: () => number | null
  /** False holds the value at null until the server clock is usable (#287). Reactive: it is watched, and the ticker reads again when it turns true. Default: the page's readiness (`serverClockReadyKey`), or always ready outside an Event page. */
  ready?: () => boolean
  /**
   * 'frame' (default): every animation frame. A number: every that many ms. A function (#584 Q1): the ms until the next read, worked out from
   * the server time just read, for a part that changes only at instants it can name (the wheel's bulbs); a delay under 1 counts as 1.
   */
  every?: 'frame' | number | ((now: number) => number)
  /** A source that makes the ticker read at once and schedule again when it changes, for a function `every` whose pending wake was worked out for the old value (a new spin). */
  restartOn?: WatchSource
  /** Pauses the ticker while this element is more than 120 px outside the viewport (IntersectionObserver, rootMargin '120px'). Optional. */
  target?: MaybeRefOrGetter<Element | null | undefined>
}

/**
 * The server's time as a ref (#257, review 0.7 Q5, 04-motion § Synchronised moments), for the parts of the stage that move with it: the
 * wheel, the Veto window, the Countdown, the coin, the clip. It is display only: ADR 0013's instants (`useInstantRefresh`) still bring
 * the page back to the server. Null until the component has mounted, so the server render and the first client render agree; on
 * mount it holds `serverNow()`. It is read again (every frame, every `every` ms or when `every` says) only while `now < until()`: the first sample at or
 * past `until` stays, so a finished moment never flips back when a clock resync moves the server time back. When `until()` changes
 * (a new spin, a new toss, a started Countdown) it reads again at once. With a `target` that is off-screen it holds its value and
 * reads again at once on return; so it does when the tab becomes visible again, because a hidden tab throttles frames. Call it in
 * `setup` before the component's own `onMounted`, so the first sample is there when that hook runs.
 *
 * It also holds null until the server clock is usable (#287, review 0.8 Q11): a device clock running ahead would end a moment
 * early on its first sample. `ready` (by default the page's `serverClockReadyKey`) says when that is; it is watched, so the ticker
 * samples the synced clock once it turns true. Outside an Event page nothing provides it, and the ticker is ready at mount.
 */
export function useServerTicker(serverNow: () => number, options: ServerTickerOptions): Readonly<Ref<number | null>> {
  const now = ref<number | null>(null)
  const ready = options.ready ?? inject(serverClockReadyKey, null) ?? (() => true)
  let mounted = false
  let onScreen = true
  let frame: number | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  let wake: ReturnType<typeof setTimeout> | undefined
  let observer: IntersectionObserver | undefined

  const pending = () => {
    const until = options.until()
    return until !== null && (now.value === null || now.value < until)
  }

  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame)
    if (interval !== undefined) clearInterval(interval)
    if (wake !== undefined) clearTimeout(wake)
    frame = undefined
    interval = undefined
    wake = undefined
  }

  function sample() {
    now.value = serverNow()
    if (!pending()) stop()
  }

  function loop() {
    if (frame !== undefined) return
    frame = requestAnimationFrame(function next() {
      frame = undefined
      sample()
      if (pending()) frame = requestAnimationFrame(next)
    })
  }

  /** A function `every`: sleeps for the ms it asks of the server time just read, reads, and sleeps again while a moment is pending and the part is in view. */
  function schedule(every: (now: number) => number) {
    wake = setTimeout(() => {
      wake = undefined
      sample()
      if (onScreen && pending()) schedule(every)
    }, Math.max(1, every(now.value!)))
  }

  /** Reads now and runs the loop again, if a moment is pending and the part is in view. */
  function restart() {
    stop()
    if (!mounted || !ready()) return
    sample()
    if (!onScreen || !pending()) return
    const { every } = options
    if (every === undefined || every === 'frame') loop()
    else if (typeof every === 'function') schedule(every)
    else interval = setInterval(sample, every)
  }

  function watchTarget(element: Element | null | undefined) {
    observer?.disconnect()
    observer = undefined
    const setOnScreen = (visible: boolean) => {
      if (visible === onScreen) return
      onScreen = visible
      if (!visible) stop()
      else comeBack()
    }
    if (!element || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true)
      return
    }
    observer = new IntersectionObserver((entries) => {
      const last = entries.at(-1)
      if (last) setOnScreen(last.isIntersecting)
    }, { rootMargin: '120px' })
    observer.observe(element)
  }

  /** In view again or the tab visible again: reads at once, unless the moment is over, whose value stays. */
  function comeBack() {
    const until = options.until()
    if (now.value !== null && until !== null && now.value >= until) return
    restart()
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') comeBack()
  }

  onMounted(() => {
    mounted = true
    restart()
    document.addEventListener('visibilitychange', onVisibility)
    if (options.target !== undefined) watch(() => toValue(options.target), watchTarget, { immediate: true, flush: 'post' })
  })
  watch(options.until, () => restart())
  if (options.restartOn) watch(options.restartOn, () => restart())
  watch(ready, (isReady) => {
    if (isReady) restart()
  })
  onBeforeUnmount(() => {
    mounted = false
    stop()
    observer?.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return readonly(now)
}
