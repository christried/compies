import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { DOMWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import type { HostGameFacts } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'
import { stubInView } from './in-view'

// The bulbs of the Show-Rad lit by server time (#521, spec #503 § The motion): the rest blink, the chase while the wheel turns, the
// stop's flash, and what a device that comes late or looks away sees. The pattern's numbers are pinned in test/unit/wheel-bulbs.test.ts;
// here it is what a Member sees (the bulbs' `data-lit`) and when the wheel looks at the server's time: at the pattern's changes, not at
// every frame (#584 Q1).

// A multiple of 1200 ms, so the rest phase at START is even.
const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const iso = (ms: number) => new Date(ms).toISOString()

function spinOf(fields: Partial<SpinView> = {}): SpinView {
  return {
    roundId: 'r1', drawId: 'd1', spinStartAt: iso(START), stopAt: iso(STOP), slices: 4, resultIndex: 2, resultOffset: 0.25,
    labels: ['Halo', 'Kart', 'Pong', 'Schach'], game: null, current: true, ...fields,
  }
}
const wheelOf = (spin: SpinView | null, fields: Partial<WheelView> = {}): WheelView => ({
  count: 3, slices: [{ id: 'a', name: 'Halo' }, { id: 'b', name: 'Kart' }, { id: 'c', name: 'Schach' }], spin, vetoes: { left: [], own: null, revealed: null, draw: null }, ...fields,
})
/** A resting wheel of `n` games. */
const restOf = (n: number) => wheelOf(null, { count: n, slices: Array.from({ length: n }, (_, index) => ({ id: `s${index}`, name: `Spiel ${index}` })) })

const EVEN = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
const ODD = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]
const ALL = Array.from({ length: 24 }, (_, index) => index)
/** The chase's set at step `step`: bulb i is lit when (i + step) % 4 = 0. */
const chase = (step: number) => ALL.filter(index => (index + step) % 4 === 0)

let serverMs = START - 1000
const serverNow = () => serverMs
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean, hostGames?: Record<string, HostGameFacts> | null } = {}) {
  page = await mountSuspended(LuckyWheel, { props: { wheel, hidden: false, isHost: false, serverNow, ...props } })
  await flushPromises()
  return page
}

/** Moves the server's time and lets the wake that follows it run: the bulbs' wake sleeps up to 0.6 s between reads (#584 Q1). */
async function at(ms: number) {
  serverMs = ms
  vi.advanceTimersByTime(700)
  await flushPromises()
}

/** The indexes of the lit bulbs, as a Member sees them. */
const lit = () => page!.findAll('[data-testid="wheel-bulb"]').flatMap((bulb: DOMWrapper<Element>, index: number) => (bulb.attributes('data-lit') === 'true' ? [index] : []))
const REDUCED = () => document.documentElement.style.setProperty('--cp-motion', 'reduced')

/** The lit bulbs of one spin at the instants that matter, seen by a device with `props`; the page is gone again after it. */
async function sampleBulbs(props: { hidden?: boolean, isHost?: boolean }) {
  serverMs = START - 1000
  await mount(wheelOf(spinOf()), props)
  const seen: number[][] = []
  for (const t of [START + 3000, STOP - 1, STOP, STOP + 120, STOP + 240, STOP + 720]) {
    await at(t)
    seen.push(lit())
  }
  page!.unmount()
  page = undefined
  return seen
}

let view: ReturnType<typeof stubInView>
beforeEach(() => {
  vi.useFakeTimers()
  serverMs = START - 1000
  view = stubInView()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  document.documentElement.style.removeProperty('--cp-motion')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the bulbs at rest', () => {
  it('show a device that opens the page at START + 600 the odd ones at once, as for one that watched', async () => {
    serverMs = START + 600
    await mount(wheelOf(null))

    expect(lit()).toEqual(ODD)
  })

  it('does not change before its moment and changes at it (#584 Q1)', async () => {
    vi.setSystemTime(START)
    page = await mountSuspended(LuckyWheel, { props: { wheel: wheelOf(null), hidden: false, isHost: false, serverNow: () => Date.now() } })
    await flushPromises()
    expect(lit()).toEqual(EVEN)

    // The pattern is still the first one at 599 ms, and the second one at 600 ms.
    vi.advanceTimersByTime(599)
    await flushPromises()
    expect(lit()).toEqual(EVEN)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(lit()).toEqual(ODD)
  })

  it('wake early for a spin that is handed in while a rest wake is pending: the chase starts at its first step, not up to 0.6 s late (#584 Q1)', async () => {
    vi.setSystemTime(START + 100)
    page = await mountSuspended(LuckyWheel, { props: { wheel: wheelOf(null), hidden: false, isHost: false, serverNow: () => Date.now() } })
    await flushPromises()
    expect(lit()).toEqual(EVEN)

    // The spin starts 250 ms in; the rest wake pending is at 600 ms.
    await page.setProps({ wheel: wheelOf(spinOf({ spinStartAt: iso(START + 250), stopAt: iso(START + 6250) })) })
    vi.advanceTimersByTime(149)
    await flushPromises()
    expect(lit()).toEqual(EVEN)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(lit()).toEqual(chase(0))
  })

  it('stand still while the wheel is scrolled out of view, and show the pattern of the clock at once on return', async () => {
    serverMs = START
    await mount(wheelOf(null))
    expect(view.observers[0]!.options.rootMargin).toBe('120px')

    view.see(false)
    await at(START + 700)
    expect(lit()).toEqual(EVEN)

    serverMs = START + 1900
    view.see(true)
    await flushPromises()
    expect(lit()).toEqual(ODD)
  })

  it('have 24 bulbs and the same pattern on a wheel of 0, 1, 2 and 30 games', async () => {
    for (const n of [0, 1, 2, 30]) {
      serverMs = START + 600
      await mount(restOf(n))
      expect(page!.findAll('[data-testid="wheel-bulb"]')).toHaveLength(24)
      expect(lit()).toEqual(ODD)
      page!.unmount()
    }
  })

  it('do not change while the clock stands still, however many frames pass', async () => {
    serverMs = START + 100
    await mount(wheelOf(null))
    const before = page!.get('[data-testid="wheel-bulbs"]').html()

    for (let frame = 0; frame < 60; frame++) vi.advanceTimersByTime(16)
    await flushPromises()

    expect(page!.get('[data-testid="wheel-bulbs"]').html()).toBe(before)
  })
})

describe('how often the wheel renders at rest', () => {
  it('renders when a bulb switches and not at every frame: twice in 1.2 s', async () => {
    let renders = 0
    serverMs = START
    page = await mountSuspended(LuckyWheel, { props: { wheel: wheelOf(null), hidden: false, isHost: false, serverNow }, global: { mixins: [{ updated: () => void renders++ }] } })
    await flushPromises()

    // 76 frames of 16 ms from an even phase: two switches (at 0.6 s and 1.2 s).
    for (let ms = 0; ms <= 1200; ms += 16) {
      serverMs = START + ms
      vi.advanceTimersByTime(16)
      await flushPromises()
    }

    expect(renders).toBe(2)
  })
})

describe('the bulbs while the wheel turns', () => {
  it('show a device that opens the page mid-spin the set of one that watched, not a chase that starts over', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 3000)
    const watched = lit()
    page!.unmount()

    serverMs = START + 3000
    await mount(wheelOf(spinOf()))

    expect(lit()).toEqual(watched)
    expect(watched).toEqual(chase(37))
  })

  it('stand still while the wheel is scrolled out of view mid-spin, and show the chase of the clock on return', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    view.see(false)
    await at(START + 4000)
    expect(lit()).toEqual(chase(12))

    serverMs = START + 4080
    view.see(true)
    await flushPromises()
    expect(lit()).toEqual(chase(51))
  })
})

describe('the bulbs at the stop', () => {
  it.each([
    ['a Member', { hidden: true, isHost: false }],
    ['the Host', { hidden: true, isHost: true }],
    ['a Member of a visible wheel', { hidden: false, isHost: false }],
  ])('are the same for %s of a Hidden wheel: the bulbs tell nothing about the game', async (_who, props) => {
    const reference = await sampleBulbs({ hidden: false, isHost: false })
    expect(new Set(reference.map(seen => JSON.stringify(seen))).size).toBeGreaterThan(1)

    expect(await sampleBulbs(props)).toEqual(reference)
  })
})

describe('the bulbs under reduced motion', () => {
  it('stay all lit, at rest, mid-spin, at the stop and after it', async () => {
    REDUCED()
    await mount(wheelOf(spinOf()))

    for (const t of [START - 1000, START, START + 80, START + 3000, STOP, STOP + 120, STOP + 720, STOP + 5000]) {
      await at(t)
      expect(lit(), `at ${t - START}`).toEqual(ALL)
    }
  })

  it('are all lit on a resting wheel, and stay so as the clock moves on', async () => {
    REDUCED()
    await mount(wheelOf(null))
    expect(lit()).toEqual(ALL)

    await at(START + 5000)

    expect(lit()).toEqual(ALL)
  })
})
