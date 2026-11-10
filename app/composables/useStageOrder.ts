import { pageFacts } from '~/utils/event-page'
import { stageArrivals, stageCounted, stageMoments, stageRises, type Block, type StageCounted, type StageInput } from '~/utils/event-stage'
import { riseSettleMs, unwatched } from '~/utils/motion'

/** The instant (server time, epoch ms) each block something waits for has arrived on top, for its latest moment (#442). */
export type StageArrivals = Partial<Record<Block, number>>

/**
 * The page's clock for the order of the stage (#441): the `now` the Stage module reads the blocks' moments at (`eventPageState(view, orderAt, counted)`). A moment is counted half
 * a second after it (RISE_DELAY_MS), so the block takes its place after the news is on the page, and the order stays a pure function of stored instants and this clock. Display only:
 * no read, no room message and no instant of its own (ADR 0013).
 *
 * `orderAt` starts null: every moment counted, so the server render and the first client render agree and a reload shows the settled order with no glide. A read of
 * the Event then sets it to the page's server time (never backwards: a resync of the clock must not lower a block that has risen), which counts the moments up to half a
 * second ago and leaves the newer ones waiting; one timer sleeps until the next rise, sets `orderAt` to it and arms again. No timer without a pending rise or arrival.
 *
 * Its second output is `counted` (#442): per block the latest moment the page has counted, shown the block risen at. A block whose newer moment is not counted yet keeps the place of
 * the last counted one, so a read never lowers a block the page already shows risen. Two faults had that shape: a reload (the null clock shows a 100 ms old moment lifted, the first read
 * counted it again only 0.4 s later, and the block dropped and rose) and a second Result (the Standings were lifted by the first, the second's moment was not counted for 0.5 s, and the
 * block fell back into the rank order and rose again). `counted` follows the view while `orderAt` is null, and from the first read on it only adds.
 *
 * Its third output is `arrivals` (#442): for a block something waits for (the Standings' result sequence, `arrives` in the Stage module), the instant it has arrived on top, which is
 * the end of its glide (or fade) when the rise moves it and the rise when it does not. It is worked out when the block's moment first appears, from `counted` as it was before that
 * moment was counted (afterwards there is no old place to move from), and the clock sleeps until it too: at that instant `orderAt` ticks, the order does not change by it, but the
 * page learns the arrival. A null clock (server render, a reload, a hidden tab) has none.
 *
 * A hidden tab takes the order at once: while `unwatched()` the value is null, a tab that turns hidden clears it and its timer, and a tab that shows again keeps null
 * until the next read. The timer and the listener are client only and end with the scope, as in useInstantRefresh.
 */
export function useStageOrder(view: () => StageInput | null | undefined, serverNow: () => number) {
  const orderAt = ref<number | null>(null)
  const counted = shallowRef<StageCounted>({})
  const arrivals = shallowRef<StageArrivals>({})
  const outputs = { orderAt: readonly(orderAt), counted: readonly(counted), arrivals: readonly(arrivals) }
  if (!import.meta.client) return outputs

  let timer: ReturnType<typeof setTimeout> | undefined
  /** The moment each arrival was worked out for: a block whose moment is the same keeps its arrival, whatever `counted` says by then. */
  let seen = new Map<Block, number>()

  function stop() {
    clearTimeout(timer)
    timer = undefined
  }

  const sameInstants = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, at]) => b[key] === at)

  /** Brings `arrivals` and `counted` up to the view and the clock: arrivals first, while `counted` is still what the page counted before this read. */
  function sync() {
    const current = view()
    if (!current) return
    const kind = pageFacts(current).kind
    const at = orderAt.value
    const moments = stageMoments(current, kind)
    const worked = stageArrivals(current, kind, riseSettleMs(), counted.value)
    const nextSeen = new Map<Block, number>()
    const next: StageArrivals = {}
    for (const [block, arrival] of Object.entries(worked) as [Block, number][]) {
      const moment = moments[block]!
      nextSeen.set(block, moment)
      // A null clock shows the block settled: there is nothing to wait for.
      const kept = seen.get(block) === moment ? arrivals.value[block] : at === null ? undefined : arrival
      if (kept !== undefined) next[block] = kept
    }
    seen = nextSeen
    if (!sameInstants(next, arrivals.value)) arrivals.value = next
    counted.value = stageCounted(current, kind, at, counted.value)
  }

  /** Sleeps until the next moment that is not counted yet or the next arrival, if the view has one. */
  function arm() {
    stop()
    const current = view()
    const at = orderAt.value
    if (!current || at === null) return
    const pending = [...stageRises(current, pageFacts(current).kind), ...Object.values(arrivals.value)].filter(instant => instant > at)
    if (pending.length === 0) return
    const due = Math.min(...pending)
    timer = setTimeout(() => {
      // The page's clock is an estimate and may lag: the instant the timer was set for is counted whatever it reads.
      orderAt.value = Math.max(orderAt.value ?? 0, serverNow(), due)
      sync()
      arm()
    }, Math.max(0, due - serverNow()))
  }

  // The view may be loaded already: the null clock counts every moment.
  sync()

  watch(view, () => {
    if (unwatched()) {
      stop()
      orderAt.value = null
      sync()
      return
    }
    orderAt.value = Math.max(orderAt.value ?? 0, serverNow())
    sync()
    arm()
  })

  const onVisibility = () => {
    if (!unwatched()) return
    stop()
    orderAt.value = null
    sync()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onScopeDispose(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return outputs
}
