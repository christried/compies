import { pageFacts } from '~/utils/event-page'
import { stageRises, type StageInput } from '~/utils/event-stage'
import { unwatched } from '~/utils/motion'

/**
 * The page's clock for the order of the stage (#441): the `now` the Stage module reads the blocks' moments at (`eventPageState(view, orderAt)`). A moment is counted half
 * a second after it (RISE_DELAY_MS), so the block takes its place after the news is on the page, and the order stays a pure function of stored instants and this one number.
 * Display only: no read, no room message and no instant of its own (ADR 0013).
 *
 * `orderAt` starts null: every moment counted, so the server render and the first client render agree and a reload shows the settled order with no glide. A read of
 * the Event then sets it to the page's server time (never backwards: a resync of the clock must not lower a block that has risen), which counts the moments up to half a
 * second ago and leaves the newer ones waiting; one timer sleeps until the next rise, sets `orderAt` to it and arms again. No timer without a pending rise.
 *
 * A hidden tab takes the order at once: while `unwatched()` the value is null, a tab that turns hidden clears it and its timer, and a tab that shows again keeps null
 * until the next read. The timer and the listener are client only and end with the scope, as in useInstantRefresh.
 */
export function useStageOrder(view: () => StageInput | null | undefined, serverNow: () => number): Readonly<Ref<number | null>> {
  const orderAt = ref<number | null>(null)
  if (!import.meta.client) return readonly(orderAt)

  let timer: ReturnType<typeof setTimeout> | undefined

  function stop() {
    clearTimeout(timer)
    timer = undefined
  }

  /** Sleeps until the next moment that is not counted yet, if the view has one. */
  function arm() {
    stop()
    const current = view()
    const at = orderAt.value
    if (!current || at === null) return
    const pending = stageRises(current, pageFacts(current).kind).filter(rise => rise > at)
    if (pending.length === 0) return
    const due = Math.min(...pending)
    timer = setTimeout(() => {
      // The page's clock is an estimate and may lag: the instant the timer was set for is counted whatever it reads.
      orderAt.value = Math.max(orderAt.value ?? 0, serverNow(), due)
      arm()
    }, Math.max(0, due - serverNow()))
  }

  watch(view, () => {
    if (unwatched()) {
      stop()
      orderAt.value = null
      return
    }
    orderAt.value = Math.max(orderAt.value ?? 0, serverNow())
    arm()
  })

  const onVisibility = () => {
    if (!unwatched()) return
    stop()
    orderAt.value = null
  }
  document.addEventListener('visibilitychange', onVisibility)
  onScopeDispose(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return readonly(orderAt)
}
