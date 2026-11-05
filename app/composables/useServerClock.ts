import type { InjectionKey } from 'vue'
import { clockOffset, type ClockSample } from '~/utils/clock'

/** How many probes a round sends, and how far apart (spec #153 § Clock sync: five to eight). */
export const CLOCK_PROBES = 6
export const CLOCK_PROBE_GAP_MS = 100
/** A message stamped more than this ahead of the estimated server time says the estimate is behind. */
export const CLOCK_DRIFT_MARGIN_MS = 500
/** How long a ticker waits for the first `clock.pong` before it runs on the device clock (#287). */
export const CLOCK_READY_GRACE_MS = 1500
/** The tickers' readiness, by provide/inject (#287): true once `useServerClock`'s `ready` is, so a ticker holds null until then. */
export const serverClockReadyKey: InjectionKey<() => boolean> = Symbol('serverClockReady')

type RoomForClock = Pick<ReturnType<typeof useEventRoom>, 'enabled' | 'on' | 'onAny' | 'send' | 'state'>

/**
 * The server's clock on this client (#162, spec #153 § Clock sync), for the timers of Glücksrad (0.7): `now()` is server time in
 * epoch ms. A round of probes (`clock.ping`, answered by `clock.pong` to this socket only) runs on every open of the
 * connection, whenever the tab becomes visible, whenever the network comes back, and when a message is stamped later
 * than the estimate, which means the estimate is behind. The offset is the one of the probe with the lowest round
 * trip (`clockOffset`); local times are `performance.now()`, which does not jump when the User's clock does. A round
 * already sending its probes is not started twice. `synced` is true from the first answer on and stays true
 * across reconnects, because the old offset is good until a new round replaces it.
 *
 * `ready` is true once the clock is usable: `synced`, or no live connection to sync over (`room.enabled` false: the page
 * polls), or no answer within `CLOCK_READY_GRACE_MS` (#287). It is provided to the descendants (`serverClockReadyKey`), and
 * a ticker waits for it before it reads `now()`, so a device clock running ahead cannot end a moment early. It never turns false.
 */
export function useServerClock(room: RoomForClock) {
  const synced = ref(false)
  const graceOver = ref(false)
  const ready = computed(() => synced.value || !room.enabled || graceOver.value)
  provide(serverClockReadyKey, () => ready.value)
  let offset = 0
  let samples: ClockSample[] = []
  /** The `t0` of every probe of the current round: an answer to anything else is stale. */
  let probes = new Set<number>()
  let sending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined

  /** Server time in epoch ms; the User's own clock until the first answer. */
  const now = () => (synced.value ? performance.now() + offset : Date.now())

  /** Starts a round of probes now, dropping one that is still sending. */
  function start() {
    clearTimeout(timer)
    samples = []
    probes = new Set()
    sending = true
    let sent = 0
    const probe = () => {
      const t0 = performance.now()
      probes.add(t0)
      room.send({ type: 'clock.ping', t0 })
      sent += 1
      if (sent < CLOCK_PROBES) timer = setTimeout(probe, CLOCK_PROBE_GAP_MS)
      else sending = false
    }
    probe()
  }

  /** Starts a round unless one is sending, or the connection is not open. */
  function sync() {
    if (room.state.value === 'open' && !sending) start()
  }

  room.on('clock.pong', (message) => {
    const t3 = performance.now()
    if (!probes.has(message.t0)) return
    samples.push({ t0: message.t0, serverTime: message.serverTime, t3 })
    const best = clockOffset(samples)
    if (best === null) return
    offset = best
    synced.value = true
  })
  room.onAny((message) => {
    if (synced.value && message.serverTime > now() + CLOCK_DRIFT_MARGIN_MS) sync()
  })
  watch(room.state, (state) => {
    if (state === 'open') start()
    else {
      clearTimeout(timer)
      sending = false
    }
  }, { immediate: true })

  const onVisibility = () => {
    if (document.visibilityState === 'visible') sync()
  }
  if (import.meta.client) {
    onMounted(() => {
      window.addEventListener('online', sync)
      document.addEventListener('visibilitychange', onVisibility)
      graceTimer = setTimeout(() => {
        graceOver.value = true
      }, CLOCK_READY_GRACE_MS)
    })
    onScopeDispose(() => {
      clearTimeout(timer)
      clearTimeout(graceTimer)
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  return { synced: readonly(synced), ready, now }
}
