import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { INSTANT_MARGIN_MS, useInstantRefresh } from '~/composables/useInstantRefresh'

// Refetching at an instant (#229, spec #218 § Deadlines): no timer runs on the server, so the client reads the Event again when
// an instant it knows passes (a wheel's stop). One timer to the next instant, re-armed when the instants change, cleared
// when the page ends, and made up for when the tab comes back after the instant. Server time here is Date.now() under fake timers.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)

async function setUp(first: number[]) {
  const instants = ref(first)
  const passed = vi.fn()
  const page = await mountSuspended(defineComponent({
    setup() {
      useInstantRefresh(instants, () => Date.now(), passed)
      return () => null
    },
  }))
  return { instants, passed, page }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useInstantRefresh', () => {
  it('refetches once when the instant has passed, and not before', async () => {
    const { passed } = await setUp([START + 6000])

    vi.advanceTimersByTime(6000)
    expect(passed).not.toHaveBeenCalled()

    vi.advanceTimersByTime(INSTANT_MARGIN_MS)
    expect(passed).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(passed).toHaveBeenCalledTimes(1)
  })

  it('goes on to the next instant, one refetch for each', async () => {
    const { passed } = await setUp([START + 2000, START + 9000])

    vi.advanceTimersByTime(2000 + INSTANT_MARGIN_MS)
    expect(passed).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(7000)
    expect(passed).toHaveBeenCalledTimes(2)
  })

  it('arms an instant that comes later: the spin of the next draw', async () => {
    const { passed, instants } = await setUp([])
    vi.advanceTimersByTime(30_000)

    instants.value = [START + 30_000 + 5000]
    await nextTick()
    vi.advanceTimersByTime(5000 + INSTANT_MARGIN_MS)

    expect(passed).toHaveBeenCalledTimes(1)
  })

  it('drops an instant that is no longer known', async () => {
    const { passed, instants } = await setUp([START + 5000])

    instants.value = []
    await nextTick()
    vi.advanceTimersByTime(60_000)

    expect(passed).not.toHaveBeenCalled()
  })

  it('does not refetch for an instant that had passed when it first saw it: the read it came with is up to date', async () => {
    const { passed } = await setUp([START - 5000])

    vi.advanceTimersByTime(60_000)

    expect(passed).not.toHaveBeenCalled()
  })

  it('stops when the page ends', async () => {
    const { passed, page } = await setUp([START + 5000])

    page.unmount()
    vi.advanceTimersByTime(60_000)

    expect(passed).not.toHaveBeenCalled()
  })

  it('refetches when the tab comes back after the instant passed while its timers slept', async () => {
    const { passed } = await setUp([START + 5000])

    vi.setSystemTime(START + 20_000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(passed).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(passed).toHaveBeenCalledTimes(1)
  })
})
