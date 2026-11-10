import { flushPromises } from '@vue/test-utils'
import { effectScope, nextTick, shallowRef, TransitionGroup } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshEvent } from '~/composables/useEventView'
import { useStageOrder } from '~/composables/useStageOrder'
import { RISE_DELAY_MS, type StageInput } from '~/utils/event-stage'
import { REFLOW_CLASS } from '~/utils/motion'
import { defaultSettings } from '~~/shared/settings'
import type { CountdownView, ResultView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { regionHeadings, stubScreen, viewWithSessions, type EventOverrides } from './event-page'
import { afterResult, FIRST, members, mount, SESSION, serveState, STARTED, team, unmountPage } from './event-page-states'

// The stage follows the game (#441): the block where something just happened takes the top of the stage half a second after its moment, with the page's glide,
// or at once when the news is older; under reduced motion it fades in, and a hidden tab takes the order at once. The order itself is the Stage module's table
// (event-stage.test.ts); here the page's clock for it (useStageOrder) and what the page does with it. The Event read carries the instants, so no room message
// and nothing on the server is involved: the tests set the system time and read the Event again.

const T = Date.parse('2090-11-10T20:00:00.000Z')
const iso = (epoch: number) => new Date(epoch).toISOString()
const RUNNING_ONE = SESSION(1, FIRST, { startedAt: STARTED })

const countdownAt = (startedAt: number | null, lastStartedAt: number | null = startedAt): CountdownView => ({
  durationMs: 600_000, remainingMs: 600_000, startedAt: startedAt === null ? null : iso(startedAt), lastStartedAt: lastStartedAt === null ? null : iso(lastStartedAt),
})
/** A Result entered at `at`, the second one of the Event. */
const resultAt = (at: number): ResultView => ({ ...afterResult.results![0]!, roundId: 'r9', number: 2, resultAt: iso(at) })

/** The Event read of a running Event with the open Round and the first Result of `afterResult` (both settled long ago), and what the test adds. */
const readOf = (slug: string, overrides: EventOverrides = {}) => viewWithSessions(slug, [RUNNING_ONE], 0, {
  event: { phase: 'running', isHost: false },
  settings: defaultSettings(),
  teams: [team(1), team(2)],
  members: members(),
  runningSessionId: `session-${slug}-0`,
  ...afterResult,
  ...overrides,
})

const TODAY = ['Gerade dran', 'Tabelle', 'Spielbrett', 'Sessions', 'So wird gespielt']
const LIFTED = ['Countdown', 'Gerade dran', 'Tabelle', 'Spielbrett', 'Sessions', 'So wird gespielt']
const WAITING = ['Gerade dran', 'Tabelle', 'Countdown', 'Spielbrett', 'Sessions', 'So wird gespielt']

/** The page's motion setting, as the tokens put it in `--cp-motion`. */
function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
}

describe('the order of the stage on the Event page', () => {
  /** The blocks that were animated with the Web Animations API, by the block they sit in. */
  let animated: { block: string | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions }[]
  /** What was animated inside the stage: other parts of the page animate too (the footer's „Neu“ chip). */
  const inStage = () => animated.filter(entry => entry.block !== undefined)
  let scrolls: ReturnType<typeof vi.fn>[]

  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
    animated = []
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        animated.push({ block: this.closest<HTMLElement>('[data-block]')?.dataset.block, keyframes, options })
        return { cancel() {}, finish() {}, currentTime: 0 }
      },
    })
    // The page never scrolls by itself (#441): any call of a scroll API fails the test below.
    scrolls = [
      vi.spyOn(window, 'scrollBy').mockImplementation(() => {}),
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {}),
    ]
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() })
    scrolls.push(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>)
  })

  afterEach(() => {
    unmountPage()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(Element.prototype, 'animate')
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  /** The page, mounted on the read as it is, and then the clock: the page needs real timers to load, the half second needs fake ones. */
  async function open(overrides: EventOverrides = {}, { now = T }: { now?: number } = {}) {
    const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: { ...afterResult, ...overrides } })
    const page = await mount(served.slug)
    await flushPromises()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date(now))
    /** The next read of the Event, as the room's `event.changed` makes the page take it. */
    const read = async (overrides: EventOverrides = {}) => {
      served.set(readOf(served.slug, overrides))
      await refreshEvent(served.slug)
      await flushPromises()
    }
    const group = () => page.findComponent(TransitionGroup)
    return { page, read, group, headings: () => regionHeadings(page) }
  }

  it('lifts a block half a second after its moment, with the page\'s glide', async () => {
    const { read, headings, group } = await open()
    expect(headings()).toEqual(TODAY)

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })

    // News 100 ms after the moment: the Countdown arrives where it sits, and waits for the rest of the half second.
    expect(headings()).toEqual(WAITING)
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100 - 1)
    expect(headings()).toEqual(WAITING)

    await vi.advanceTimersByTimeAsync(1)
    expect(headings()).toEqual(LIFTED)
    expect(group().props('moveClass')).toBe(REFLOW_CLASS)
    expect(inStage()).toEqual([])
  })

  it('lifts a block at once when the news is older than half a second', async () => {
    const { read, headings } = await open()

    vi.setSystemTime(new Date(T + 2000))
    await read({ countdown: countdownAt(T) })

    expect(headings()).toEqual(LIFTED)
  })

  it('lifts a Result above the open Rounds, and a newer Countdown above that, newest first', async () => {
    const { read, headings } = await open()

    vi.setSystemTime(new Date(T + 2000))
    await read({ results: [afterResult.results![0]!, resultAt(T)], standings: afterResult.standings, end: { played: 2, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null } })
    expect(headings()).toEqual(['Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])

    vi.setSystemTime(new Date(T + 5000))
    await read({ results: [afterResult.results![0]!, resultAt(T)], countdown: countdownAt(T + 4000) })
    expect(headings()).toEqual(['Countdown', 'Tabelle', 'Gerade dran', 'Spielbrett', 'Sessions', 'So wird gespielt'])
  })

  it('calls no scroll API when the stage reorders: the page never scrolls by itself', async () => {
    const { read, headings } = await open()

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)

    expect(headings()[0]).toBe('Countdown')
    for (const scroll of scrolls) expect(scroll).not.toHaveBeenCalled()
  })

  it('fades the rising block in for 0.14 s under reduced motion, and animates nothing else', async () => {
    const { read, headings, group } = await open()
    motion('reduced')

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })
    expect(inStage()).toEqual([])

    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)
    await flushPromises()

    expect(headings()).toEqual(LIFTED)
    expect(inStage()).toHaveLength(1)
    expect(inStage()[0]).toEqual({ block: 'countdown', keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 140, easing: 'ease-out', fill: 'backwards' } })
    // The glide is the class's own: it has nothing under reduced motion (`reduced:transition-none`).
    expect(String(group().props('moveClass')).split(' ')).toContain('reduced:transition-none')
  })

  it('does not fade a block that arrives, or one that only shifts down because another rose', async () => {
    const { read } = await open()
    motion('reduced')

    vi.setSystemTime(new Date(T + 2000))
    await read({ countdown: countdownAt(T) })
    await flushPromises()

    // The Countdown arrives lifted: nobody saw it anywhere else, so it only appears. Gerade dran and Tabelle shift down and keep their order.
    expect(inStage()).toEqual([])
  })

  it('takes the order at once in a hidden tab: no wait, no glide and no animation', async () => {
    const { read, headings, group } = await open()
    motion('reduced')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })

    expect(headings()).toEqual(LIFTED)
    expect(group().props('moveClass')).toBeUndefined()
    expect(inStage()).toEqual([])
  })

  it('shows the settled order on the first render of a reload, whether the moment is 100 ms or an hour old', async () => {
    for (const age of [100, 3_600_000]) {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(T + age))
      const served = serveState({ sessions: [RUNNING_ONE], missing: 0, phase: 'running', running: 0, overrides: { ...afterResult, countdown: countdownAt(T) } })

      const page = await mount(served.slug)

      expect(regionHeadings(page)).toEqual(LIFTED)
      vi.useRealTimers()
    }
  })

  it('shows the same order on the phone\'s Event tab', async () => {
    stubScreen(false)
    const { read, headings } = await open()
    vi.setSystemTime(new Date(T + 100))
    await read({ countdown: countdownAt(T) })
    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS)

    expect(headings()).toEqual(LIFTED)
  })

  it('keeps a lifted Countdown where it is when the Host pauses it, and moves nothing for a Bonus Veto', async () => {
    const { read, headings } = await open({ countdown: countdownAt(T) })
    expect(headings()).toEqual(LIFTED)

    vi.setSystemTime(new Date(T + 3000))
    await read({ countdown: { ...countdownAt(T), startedAt: null, remainingMs: 597_000 } })
    expect(headings()).toEqual(LIFTED)

    await read({ countdown: countdownAt(T), bonusVetoes: { left: [1, 0], granted: [] } } as unknown as EventOverrides)
    expect(headings()).toEqual(LIFTED)
  })
})

describe('the clock of the stage order', () => {
  const stageInput = (overrides: EventOverrides = {}) => readOf('clock', overrides) as unknown as StageInput
  let scope: ReturnType<typeof effectScope>
  /** How far the page's server clock reads from the system time: negative = it lags (the estimate is behind). */
  let skew: number
  const now = () => Date.now() + skew

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date(T))
    skew = 0
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /** The order clock on a view the test replaces, as the page's `data` is replaced by every read. */
  function clock(initial: StageInput | null = stageInput()) {
    const view = shallowRef<StageInput | null>(initial)
    const orderAt = scope.run(() => useStageOrder(() => view.value, now))!
    return { view, orderAt }
  }
  const read = async (view: ReturnType<typeof clock>['view'], next: StageInput) => {
    view.value = next
    await nextTick()
  }

  it('starts at null: every moment counted, as the server render and the first client render have it', () => {
    const { orderAt } = clock(stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('takes the page\'s clock at a read, and arms one timer for the next rise: the moment plus half a second', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))

    await read(view, stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBe(T + 100)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100)
    expect(orderAt.value).toBe(T + RISE_DELAY_MS)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('counts a rise that the page\'s clock lags behind: the timer takes its due instant, never less', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T) }))

    // The server clock estimate is 80 ms behind the timer: the moment must still count when it fires.
    skew = -80
    await vi.advanceTimersByTimeAsync(400)

    expect(orderAt.value).toBe(T + RISE_DELAY_MS)
  })

  it('arms no timer for a read with no moment, for a moment already counted, or for a pause', async () => {
    const { view } = clock()
    vi.setSystemTime(new Date(T + 2000))

    await read(view, stageInput())
    expect(vi.getTimerCount()).toBe(0)

    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(vi.getTimerCount()).toBe(0)

    await read(view, stageInput({ countdown: { ...countdownAt(T), startedAt: null } }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('arms for the nearest rise first, then for the next one', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T), results: [afterResult.results![0]!, resultAt(T + 300)] }))

    await vi.advanceTimersByTimeAsync(RISE_DELAY_MS - 100)
    expect(orderAt.value).toBe(T + RISE_DELAY_MS)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(300)
    expect(orderAt.value).toBe(T + 300 + RISE_DELAY_MS)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never goes backwards: a resync of the clock does not lower a block that has risen', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 2000))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(orderAt.value).toBe(T + 2000)

    skew = -1000
    await read(view, stageInput({ countdown: countdownAt(T) }))

    expect(orderAt.value).toBe(T + 2000)
  })

  it('is null while the tab is hidden, and a tab that turns hidden drops its timer', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(vi.getTimerCount()).toBe(1)

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(orderAt.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    await read(view, stageInput({ countdown: countdownAt(T + 50) }))
    expect(orderAt.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    // Back visible it stays null until the next read.
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(orderAt.value).toBeNull()
    await read(view, stageInput({ countdown: countdownAt(T + 50) }))
    expect(orderAt.value).toBe(T + 100)
  })

  it('clears its timer and its listener when its scope ends', async () => {
    const { view, orderAt } = clock()
    vi.setSystemTime(new Date(T + 100))
    await read(view, stageInput({ countdown: countdownAt(T) }))
    expect(vi.getTimerCount()).toBe(1)

    scope.stop()

    expect(vi.getTimerCount()).toBe(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(orderAt.value).toBe(T + 100)
  })
})
