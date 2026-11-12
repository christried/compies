import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import { pinCrossings } from '~/utils/wheel-pins'
import type { SpinView, WheelView } from '~~/shared/stage'
import { stubInView } from './in-view'

// The flapper's kicks on the stage (#522, spec #503 § The motion): it is raised just after a pin passed the top, rests between the pins
// and after the spin, stays up between pins that come faster than a kick lasts, is the same for a Member who joins mid-spin as for one who
// watched, and does not kick under reduced motion. The kick's numbers are pinned in test/unit/wheel-pins.test.ts.

// The crossings are worked out once per spin (#584 Q3): the spy counts how often the component asks for them.
vi.mock('~/utils/wheel-pins', async (original) => {
  const actual = await original<typeof import('~/utils/wheel-pins')>()
  return { ...actual, pinCrossings: vi.fn(actual.pinCrossings) }
})

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const iso = (ms: number) => new Date(ms).toISOString()

function spinOf(fields: Partial<SpinView> = {}): SpinView {
  return {
    roundId: 'r1', drawId: 'd1', spinStartAt: iso(START), stopAt: iso(STOP), slices: 4, resultIndex: 2, resultOffset: 0.25,
    labels: ['Halo', 'Kart', 'Pong', 'Schach'], game: null, current: true, ...fields,
  }
}
const wheelOf = (spin: SpinView | null): WheelView => ({
  count: 3, slices: [{ id: 'a', name: 'Halo' }, { id: 'b', name: 'Kart' }, { id: 'c', name: 'Schach' }], spin, vetoes: { left: [], own: null, revealed: null, draw: null },
})

/** The crossings of the spin above, as the component works them out: what a test needs to know when a pin passes. */
const crossings = pinCrossings({ spinStartAt: START, stopAt: STOP, slices: 4, resultIndex: 2, resultOffset: 0.25 })

let serverMs = START - 1000
const serverNow = vi.fn(() => serverMs)
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView) {
  page = await mountSuspended(LuckyWheel, { props: { wheel, hidden: false, isHost: false, serverNow } })
  await flushPromises()
  return page
}

async function at(ms: number) {
  serverMs = ms
  vi.advanceTimersByTime(50)
  await flushPromises()
}

const armTransform = () => page!.get('[data-testid="wheel-flapper-arm"]').attributes('transform')
/** The arm's angle in degrees, read from `rotate(<angle> 22 10)`. */
const armAngle = () => Number(/^rotate\((-?[\d.e+-]+) 22 10\)$/.exec(armTransform()!)![1])

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = START - 1000
  serverNow.mockClear()
  stubInView()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  document.documentElement.style.removeProperty('--cp-motion')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the flapper kicks at the pins', () => {
  it('is raised, to the left, just after a pin has passed the top', async () => {
    await mount(wheelOf(spinOf()))

    await at(crossings.at(-1)!.at + 4)

    expect(armAngle()).toBeGreaterThan(29)
    expect(armAngle()).toBeLessThanOrEqual(30)
  })

  it('rests between pins, before the first, after the stop and at rest', async () => {
    await mount(wheelOf(spinOf()))

    await at(crossings.at(-1)!.at + 200)
    expect(armTransform()).toBe('rotate(0 22 10)')
    await at(START + 20)
    expect(armTransform()).toBe('rotate(0 22 10)')
    await at(STOP + 1000)
    expect(armTransform()).toBe('rotate(0 22 10)')

    page!.unmount()
    serverMs = START - 1000
    await mount(wheelOf(null))
    expect(armTransform()).toBe('rotate(0 22 10)')
  })

  it('stays up between two pins that come closer than a kick lasts', async () => {
    await mount(wheelOf(spinOf()))

    // The pins at about 915 and 1032 ms into the spin are 117 ms apart.
    await at(START + 980)

    expect(armTransform()).toBe('rotate(30 22 10)')
  })

  it('shows a Member who joins in the middle of the spin what the one who watched sees', async () => {
    await mount(wheelOf(spinOf()))
    await at(crossings[19]!.at + 18)
    const watched = armAngle()
    page!.unmount()

    serverMs = crossings[19]!.at + 18
    await mount(wheelOf(spinOf()))

    expect(watched).toBeGreaterThan(0)
    expect(armAngle()).toBeCloseTo(watched, 6)
  })

  it('does not kick under reduced motion', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    await mount(wheelOf(spinOf()))

    await at(crossings.at(-1)!.at + 4)
    expect(armTransform()).toBe('rotate(0 22 10)')
    await at(START + 980)
    expect(armTransform()).toBe('rotate(0 22 10)')
  })
})

describe('a spin handed in again (#584 Q3)', () => {
  it('is not worked out again when it is equal: the crossings are not asked for and the flapper keeps its angle', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 3000)
    const before = armTransform()
    vi.mocked(pinCrossings).mockClear()

    // A refetch brings the same spin as a new object.
    await page!.setProps({ wheel: wheelOf(spinOf()) })

    expect(pinCrossings).not.toHaveBeenCalled()
    expect(armTransform()).toBe(before)
    await at(START + 3000)
    expect(armTransform()).toBe(before)
  })

  it.each([
    ['another result', { resultIndex: 1 }],
    ['a stop a millisecond later', { stopAt: iso(STOP + 1) }],
  ])('is worked out again when it changes: %s', async (_what, fields) => {
    await mount(wheelOf(spinOf()))
    await at(START + 3000)
    vi.mocked(pinCrossings).mockClear()

    await page!.setProps({ wheel: wheelOf(spinOf(fields)) })

    expect(pinCrossings).toHaveBeenCalledTimes(1)
  })
})
