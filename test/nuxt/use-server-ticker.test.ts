import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useServerTicker, type ServerTickerOptions } from '~/composables/useServerTicker'
import { stubInView } from './in-view'

// The one ticker behind the stage's moving parts (#257, review 0.7 Q5, 04-motion § Synchronised moments): the server's time as a ref
// that is null until mount, runs only while a moment is pending, stops at it, restarts when the moment changes, and pauses off-screen.
// Server time here is Date.now() plus a skew the tests move, under fake timers; the spy counts how often the ticker looked at it.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const FRAME_MS = 16

let skew: number
const serverNow = vi.fn(() => Date.now() + skew)

interface Setup {
  until?: number | null
  every?: ServerTickerOptions['every']
  withTarget?: boolean
  ready?: ServerTickerOptions['ready']
  restartOn?: boolean
}

async function setUp({ until = null, every, withTarget = false, ready, restartOn = false }: Setup = {}) {
  const pending = ref<number | null>(until)
  const source = ref(0)
  const shown = ref(withTarget)
  const seen: { atSetup: number | null | undefined, ticker: Readonly<Ref<number | null>> | undefined, second: Readonly<Ref<number | null>> | undefined } = { atSetup: undefined, ticker: undefined, second: undefined }
  const target = ref<Element | null>(null)
  const page = await mountSuspended(defineComponent({
    setup() {
      const ticker = useServerTicker(serverNow, { until: () => pending.value, every, target: withTarget ? target : undefined, ready, restartOn: restartOn ? source : undefined })
      // A second ticker in the same component keeps its own moment.
      const second = useServerTicker(serverNow, { until: () => null })
      seen.atSetup = ticker.value
      seen.ticker = ticker
      seen.second = second
      return () => h('div', [h('p', { 'data-testid': 'now' }, String(ticker.value)), shown.value ? h('section', { ref: target }) : null])
    },
  }))
  return { pending, shown, page, seen, source, value: () => seen.ticker!.value }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance'] })
  vi.setSystemTime(START)
  skew = 0
  serverNow.mockClear()
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useServerTicker', () => {
  it('is null at setup, so the server render and the first client render agree, and has the server time once mounted', async () => {
    const { seen, value, page } = await setUp({ until: START + 5000 })

    expect(seen.atSetup).toBeNull()
    expect(value()).toBe(START)
    expect(page.get('[data-testid="now"]').text()).toBe(String(START))
  })

  it('reads the time every frame while the moment is pending', async () => {
    const { value } = await setUp({ until: START + 5000 })
    serverNow.mockClear()

    vi.advanceTimersByTime(FRAME_MS * 10)

    expect(serverNow).toHaveBeenCalledTimes(10)
    expect(value()).toBeGreaterThanOrEqual(START + FRAME_MS * 9)
  })

  it('in number mode reads only at its interval', async () => {
    const { value } = await setUp({ until: START + 5000, every: 250 })
    serverNow.mockClear()

    vi.advanceTimersByTime(249)
    expect(serverNow).not.toHaveBeenCalled()
    expect(value()).toBe(START)

    vi.advanceTimersByTime(1)
    expect(serverNow).toHaveBeenCalledTimes(1)
    expect(value()).toBe(START + 250)
  })

  describe('with a function for every (#584 Q1)', () => {
    /** The ms to the next full 100 ms of the server time: it sleeps between the instants a part changes at. */
    const toNextHundred = (now: number) => 100 - (now % 100)

    it('reads at exactly the delays it returns, worked out from the server time just read', async () => {
      vi.setSystemTime(START + 30)
      const { value } = await setUp({ until: START + 60_000, every: toNextHundred })
      serverNow.mockClear()

      vi.advanceTimersByTime(69)
      expect(serverNow).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(serverNow).toHaveBeenCalledTimes(1)
      expect(value()).toBe(START + 100)

      vi.advanceTimersByTime(99)
      expect(serverNow).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(serverNow).toHaveBeenCalledTimes(2)
      expect(value()).toBe(START + 200)
    })

    it('waits at least 1 ms for a delay of 0 or less, so it never spins', async () => {
      await setUp({ until: START + 60_000, every: () => 0 })
      serverNow.mockClear()

      vi.advanceTimersByTime(5)

      expect(serverNow).toHaveBeenCalledTimes(5)
    })

    it('stops at the moment and keeps its value', async () => {
      const { value } = await setUp({ until: START + 250, every: () => 100 })

      vi.advanceTimersByTime(1000)
      expect(value()).toBe(START + 300)
      serverNow.mockClear()
      vi.advanceTimersByTime(1000)

      expect(serverNow).not.toHaveBeenCalled()
      expect(value()).toBe(START + 300)
    })

    it('reads again at once when the moment changes, and the wake it had pending is replaced', async () => {
      const { pending } = await setUp({ until: START + 60_000, every: () => 100 })
      vi.advanceTimersByTime(50)
      serverNow.mockClear()

      pending.value = START + 70_000
      await nextTick()
      expect(serverNow).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(99)
      expect(serverNow).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(serverNow).toHaveBeenCalledTimes(2)
    })

    it('stops when the moment goes away', async () => {
      const { pending } = await setUp({ until: START + 60_000, every: () => 100 })
      pending.value = null
      await nextTick()
      serverNow.mockClear()

      vi.advanceTimersByTime(1000)

      expect(serverNow).not.toHaveBeenCalled()
    })

    it('reads again at once when its restartOn source changes, and the wake it had pending is replaced', async () => {
      const { source } = await setUp({ until: START + 60_000, every: () => 100, restartOn: true })
      vi.advanceTimersByTime(50)
      serverNow.mockClear()

      source.value++
      await nextTick()
      expect(serverNow).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(99)
      expect(serverNow).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(serverNow).toHaveBeenCalledTimes(2)
    })

    it('does not read when nothing changed: a restartOn source that is set to the value it has', async () => {
      const { source } = await setUp({ until: START + 60_000, every: () => 100, restartOn: true })
      serverNow.mockClear()

      source.value = 0
      await nextTick()

      expect(serverNow).not.toHaveBeenCalled()
    })

    it('pauses off screen, keeps the value, and reads again at once on return', async () => {
      const view = stubInView()
      const { value } = await setUp({ until: START + 60_000, every: () => 100, withTarget: true })
      const [observer] = view.observers
      vi.advanceTimersByTime(250)

      observer!.see(false)
      const away = value()
      serverNow.mockClear()
      vi.advanceTimersByTime(5000)
      expect(serverNow).not.toHaveBeenCalled()
      expect(value()).toBe(away)

      observer!.see(true)
      expect(serverNow).toHaveBeenCalledTimes(1)
      expect(value()).toBe(START + 250 + 5000)
      vi.advanceTimersByTime(100)
      expect(serverNow).toHaveBeenCalledTimes(2)
    })

    it('reads again at once when the tab becomes visible, and runs again', async () => {
      const { value } = await setUp({ until: START + 60_000, every: () => 100 })
      vi.advanceTimersByTime(250)
      skew = 30_000
      serverNow.mockClear()

      document.dispatchEvent(new Event('visibilitychange'))

      expect(value()).toBe(START + 250 + 30_000)
      serverNow.mockClear()
      vi.advanceTimersByTime(100)
      expect(serverNow).toHaveBeenCalledTimes(1)
    })

    it('holds the value while the ready option is false, and reads again when it turns true', async () => {
      const ready = ref(false)
      const { value } = await setUp({ until: START + 60_000, every: () => 100, ready: () => ready.value })
      vi.advanceTimersByTime(500)
      expect(value()).toBeNull()

      ready.value = true
      await nextTick()
      expect(value()).toBe(START + 500)
      serverNow.mockClear()
      vi.advanceTimersByTime(100)
      expect(serverNow).toHaveBeenCalledTimes(1)
    })

    it('clears its pending wake when the component unmounts: no read after', async () => {
      const { page } = await setUp({ until: START + 60_000, every: () => 100 })
      vi.advanceTimersByTime(250)

      page.unmount()
      serverNow.mockClear()
      vi.advanceTimersByTime(1000)

      expect(serverNow).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('stops reading at the moment and keeps its value, also when the clock is later set back', async () => {
    const { value } = await setUp({ until: START + 100 })

    vi.advanceTimersByTime(1000)
    const final = value()!
    expect(final).toBeGreaterThanOrEqual(START + 100)

    serverNow.mockClear()
    skew = -60_000
    vi.advanceTimersByTime(1000)
    expect(serverNow).not.toHaveBeenCalled()
    expect(value()).toBe(final)
  })

  it('reads once and runs no loop when nothing is pending', async () => {
    const { value } = await setUp({ until: null })

    vi.advanceTimersByTime(1000)

    expect(serverNow).toHaveBeenCalledTimes(2) // this ticker's sample and the second ticker's
    expect(value()).toBe(START)
  })

  it('reads once and runs no loop when the moment had passed at mount', async () => {
    const { value } = await setUp({ until: START - 1 })

    vi.advanceTimersByTime(1000)

    expect(serverNow).toHaveBeenCalledTimes(2)
    expect(value()).toBe(START)
  })

  it('reads again at once and runs again when the moment changes: a new spin', async () => {
    const { pending, value } = await setUp({ until: START + 100 })
    vi.advanceTimersByTime(1000)
    serverNow.mockClear()

    pending.value = START + 1000 + 3000
    await nextTick()
    expect(serverNow).toHaveBeenCalledTimes(1)
    expect(value()).toBe(START + 1000)

    vi.advanceTimersByTime(FRAME_MS * 5)
    expect(value()).toBeGreaterThanOrEqual(START + 1000 + FRAME_MS * 4)
  })

  it('holds null while the ready option is false, and samples at once when it turns true (#287)', async () => {
    const ready = ref(false)
    const { value } = await setUp({ until: START + 5000, ready: () => ready.value })
    vi.advanceTimersByTime(FRAME_MS * 3)
    expect(value()).toBeNull()

    skew = 1000
    ready.value = true
    await nextTick()

    expect(value()).toBe(START + FRAME_MS * 3 + 1000)
  })

  it('stops when the moment goes away: a paused Countdown', async () => {
    const { pending } = await setUp({ until: START + 5000 })
    vi.advanceTimersByTime(100)

    pending.value = null
    await nextTick()
    serverNow.mockClear()
    vi.advanceTimersByTime(1000)

    expect(serverNow).not.toHaveBeenCalled()
  })

  it('stops reading when the component unmounts', async () => {
    const { page } = await setUp({ until: START + 5000 })
    vi.advanceTimersByTime(100)

    page.unmount()
    serverNow.mockClear()
    vi.advanceTimersByTime(1000)

    expect(serverNow).not.toHaveBeenCalled()
  })

  it('reads again at once when the tab becomes visible, and runs again', async () => {
    const { value } = await setUp({ until: START + 60_000 })
    vi.advanceTimersByTime(100)
    skew = 30_000
    serverNow.mockClear()

    document.dispatchEvent(new Event('visibilitychange'))

    expect(serverNow).toHaveBeenCalledTimes(2) // this ticker and the second one
    expect(value()).toBe(START + 100 + 30_000)
    vi.advanceTimersByTime(FRAME_MS * 2)
    expect(serverNow.mock.calls.length).toBeGreaterThan(1)
  })

  it('keeps the value of a moment that is over when the tab becomes visible', async () => {
    const { value } = await setUp({ until: START + 100 })
    vi.advanceTimersByTime(1000)
    const final = value()
    skew = -60_000

    document.dispatchEvent(new Event('visibilitychange'))

    expect(value()).toBe(final)
  })

  it('removes its visibility listener on unmount', async () => {
    const { page } = await setUp({ until: START + 60_000 })
    page.unmount()
    serverNow.mockClear()

    document.dispatchEvent(new Event('visibilitychange'))

    expect(serverNow).not.toHaveBeenCalled()
  })

  describe('with a target', () => {
    let view: ReturnType<typeof stubInView>
    beforeEach(() => {
      view = stubInView()
    })

    it('watches the element with a margin of 120 px and runs while it is on screen', async () => {
      const { page } = await setUp({ until: START + 5000, withTarget: true })

      const [observer] = view.observers
      expect(observer!.options.rootMargin).toBe('120px')
      expect(observer!.observed).toEqual([page.get('section').element])

      serverNow.mockClear()
      vi.advanceTimersByTime(FRAME_MS * 3)
      expect(serverNow).toHaveBeenCalledTimes(3)
    })

    it('stops reading off-screen, keeps the value, and reads again at once on return', async () => {
      const { value } = await setUp({ until: START + 60_000, withTarget: true })
      const [observer] = view.observers
      vi.advanceTimersByTime(FRAME_MS * 3)

      observer!.see(false)
      const away = value()
      serverNow.mockClear()
      vi.advanceTimersByTime(5000)
      expect(serverNow).not.toHaveBeenCalled()
      expect(value()).toBe(away)

      observer!.see(true)
      expect(serverNow).toHaveBeenCalledTimes(1)
      expect(value()).toBe(START + FRAME_MS * 3 + 5000)
      vi.advanceTimersByTime(FRAME_MS * 2)
      expect(serverNow.mock.calls.length).toBeGreaterThan(1)
    })

    it('takes a moment that ended while off-screen as it is on return, without a loop', async () => {
      const { value } = await setUp({ until: START + 1000, withTarget: true })
      view.observers[0]!.see(false)
      vi.advanceTimersByTime(5000)

      view.observers[0]!.see(true)
      expect(value()).toBe(START + 5000)
      serverNow.mockClear()
      vi.advanceTimersByTime(1000)
      expect(serverNow).not.toHaveBeenCalled()
    })

    it('starts watching when the element appears later: a v-if', async () => {
      const { shown, page } = await setUp({ until: START + 5000, withTarget: true })
      shown.value = false
      await nextTick()

      shown.value = true
      await nextTick()

      const last = view.observers.at(-1)!
      expect(last.observed).toEqual([page.get('section').element])
    })

    it('disconnects its observer on unmount', async () => {
      const { page } = await setUp({ until: START + 5000, withTarget: true })

      page.unmount()

      expect(view.observers.every(observer => observer.disconnected)).toBe(true)
    })

    it('treats a missing IntersectionObserver as on screen', async () => {
      vi.stubGlobal('IntersectionObserver', undefined)
      await setUp({ until: START + 5000, withTarget: true })
      serverNow.mockClear()

      vi.advanceTimersByTime(FRAME_MS * 3)

      expect(serverNow).toHaveBeenCalledTimes(3)
    })
  })
})
