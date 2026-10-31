import { clockOffset, type ClockSample } from '~/utils/clock'

/** How many probes a round sends, and how far apart (spec #153 § Clock sync: five to eight). */
export const CLOCK_PROBES = 6
export const CLOCK_PROBE_GAP_MS = 100
/** A message stamped more than this ahead of the estimated server time says the estimate is behind. */
export const CLOCK_DRIFT_MARGIN_MS = 500

type RoomForClock = Pick<ReturnType<typeof useEventRoom>, 'on' | 'onAny' | 'send' | 'state'>

/**
 * The server's clock on this client (#162, spec #153 § Clock sync), for the timers of 1.5: `now()` is server time in
 * epoch ms. A round of probes (`clock.ping`, answered by `clock.pong` to this socket only) runs on every open of the
 * connection, whenever the tab becomes visible, whenever the network comes back, and when a message is stamped later
 * than the estimate, which means the estimate is behind. The offset is the one of the probe with the lowest round
 * trip (`clockOffset`); local times are `performance.now()`, which does not jump when the User's clock does. A round
 * already sending its probes is not started twice. `synced` is true from the first answer on and stays true
 * across reconnects, because the old offset is good until a new round replaces it.
 */
export function useServerClock(room: RoomForClock) {
  const synced = ref(false)
  let offset = 0
  let samples: ClockSample[] = []
  /** The `t0` of every probe of the current round: an answer to anything else is stale. */
  let probes = new Set<number>()
  let sending = false
  let timer: ReturnType<typeof setTimeout> | undefined

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
    })
    onScopeDispose(() => {
      clearTimeout(timer)
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  return { synced: readonly(synced), now }
}
