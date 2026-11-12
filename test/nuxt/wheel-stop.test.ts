import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import type { RoundGame } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'
import { stubInView } from './in-view'

// The pops at the stop (#523, 04-motion § Lucky Wheel `stop`): the drawn label and the result card pop from the server's time alone, so a
// Member who arrives later sees the end state with no replay. What the User sees is the card's scale and opacity and the drawn label's
// scaleY, read here from the DOM at server times the test sets. The curve itself is tested in test/unit/wheel-stop.test.ts.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const iso = (ms: number) => new Date(ms).toISOString()

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

function spinOf(fields: Partial<SpinView> = {}): SpinView {
  return {
    roundId: 'r1', drawId: 'd1', spinStartAt: iso(START), stopAt: iso(STOP), slices: 4, resultIndex: 2, resultOffset: 0.25,
    labels: ['Halo', 'Kart', 'Pong', 'Schach'], game: halo, current: true, ...fields,
  }
}
const wheelOf = (spin: SpinView | null, fields: Partial<WheelView> = {}): WheelView => ({
  count: 3, slices: [{ id: 'a', name: 'Halo' }, { id: 'b', name: 'Kart' }, { id: 'c', name: 'Schach' }], spin, vetoes: { left: [], own: null, revealed: null, draw: null }, ...fields,
})

let serverMs = START - 1000
const serverNow = vi.fn(() => serverMs)
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean } = {}) {
  page = await mountSuspended(LuckyWheel, { props: { wheel, hidden: false, isHost: false, serverNow, ...props } })
  await flushPromises()
  return page
}

/** Moves the server's clock and lets the frame that follows it run. */
async function at(ms: number) {
  serverMs = ms
  vi.advanceTimersByTime(50)
  await flushPromises()
}

const card = () => page!.find('[data-testid="wheel-card"]')
const cardScale = () => Number(/scale\(([\d.]+)\)/.exec(card().attributes('style') ?? '')?.[1])
const cardOpacity = () => Number(/opacity:\s*([\d.]+)/.exec(card().attributes('style') ?? '')?.[1])
const label = (index = 2) => page!.get(`[data-testid="wheel-label-${index}"]`)
/** The `s` of `scale(1 s)` in the label's transform: always there, 1 at rest. */
const labelScale = (index = 2) => Number(/scale\(1 ([\d.]+)\)/.exec(label(index).attributes('transform') ?? '')?.[1])

beforeEach(() => {
  vi.useFakeTimers()
  stubInView()
  serverMs = START - 1000
  serverNow.mockClear()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  document.documentElement.style.removeProperty('--cp-motion')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the pops at the stop', () => {
  it('shows no card and draws the drawn label at identity before the stop', async () => {
    await mount(wheelOf(spinOf()))
    await at(STOP - 100)

    expect(card().exists()).toBe(false)
    expect(label().attributes('transform')).toContain('scale(1 1)')
  })

  it('starts both small at the stop: the card at 0.6 and invisible, the label flat', async () => {
    await mount(wheelOf(spinOf()))
    await at(STOP - 100)
    await at(STOP)

    expect(cardScale()).toBe(0.6)
    expect(cardOpacity()).toBe(0)
    expect(labelScale()).toBe(0)
  })

  it('pops past its size near the peak, 1.08 for the card and 1.25 for the label at most', async () => {
    await mount(wheelOf(spinOf()))
    await at(STOP - 100)
    await at(STOP + 54)

    expect(cardScale()).toBeGreaterThan(1.05)
    expect(cardScale()).toBeLessThanOrEqual(1.08)
    expect(labelScale()).toBeGreaterThan(1.15)
    expect(labelScale()).toBeLessThanOrEqual(1.25)
  })

  it('dips a little under its size in the overshoot', async () => {
    await mount(wheelOf(spinOf()))
    await at(STOP - 100)
    await at(STOP + 250)

    expect(cardScale()).toBeGreaterThan(0.97)
    expect(cardScale()).toBeLessThan(1)
    expect(labelScale()).toBeGreaterThan(0.93)
    expect(labelScale()).toBeLessThan(1)
  })

  it('rests after the run, and the card no longer carries a CSS animation that would replay on a mount', async () => {
    await mount(wheelOf(spinOf()))
    await at(STOP - 100)
    await at(STOP + 3000)

    expect(cardScale()).toBe(1)
    expect(cardOpacity()).toBe(1)
    expect(labelScale()).toBe(1)
    expect(card().classes()).not.toContain('animate-pop-in')
  })

  it('shows a late joiner the end state at once, with no frame below its size', async () => {
    serverMs = STOP + 1500
    await mount(wheelOf(spinOf()))

    expect(card().exists()).toBe(true)
    expect(cardScale()).toBe(1)
    expect(cardOpacity()).toBe(1)
    expect(labelScale()).toBe(1)
    expect(card().classes()).not.toContain('animate-pop-in')
    await at(STOP + 1550)
    expect(cardScale()).toBe(1)
  })

  it('pops the single label of a wheel with one game', async () => {
    await mount(wheelOf(spinOf({ slices: 1, resultIndex: 0, labels: ['Halo'] }), { count: 1, slices: [{ id: 'a', name: 'Halo' }] }))
    await at(STOP - 100)
    expect(labelScale(0)).toBe(1)
    await at(STOP + 54)

    expect(labelScale(0)).toBeGreaterThan(1.15)
    expect(card().exists()).toBe(true)
  })

  it('pops only the drawn label, not the others', async () => {
    await mount(wheelOf(spinOf()))
    await at(STOP - 100)
    await at(STOP + 54)

    expect(labelScale(0)).toBe(1)
    expect(labelScale(1)).toBe(1)
    expect(labelScale(3)).toBe(1)
  })
})

describe('the pops under reduced motion', () => {
  it('crossfades the card and the drawn label in place, with no scale', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    await mount(wheelOf(spinOf()))
    await at(STOP - 100)
    await at(STOP + 100)

    expect(cardScale()).toBe(1)
    expect(cardOpacity()).toBeCloseTo(0.5, 1)
    expect(labelScale()).toBe(1)
    expect(Number(label().attributes('opacity'))).toBeCloseTo(0.5, 1)
  })
})

describe('the pops under a Hidden wheel', () => {
  const placeholders = ['Counter-Strudel', 'League of Leberkäse', 'Mario Kartoffel', 'Rocket Lieg']

  it('gives a Member no card and an unpopped placeholder before the stop', async () => {
    await mount(wheelOf(spinOf({ labels: placeholders, game: null }), { slices: null }), { hidden: true })
    await at(STOP - 100)

    expect(card().exists()).toBe(false)
    expect(label().attributes('transform')).toContain('scale(1 1)')
    expect(label().text()).toBe('Mario Kartoffel')
  })

  it('pops the placeholder at the stop, which names nothing', async () => {
    await mount(wheelOf(spinOf({ labels: placeholders, game: null }), { slices: null }), { hidden: true })
    await at(STOP - 100)
    await at(STOP + 54)

    expect(labelScale()).toBeGreaterThan(1.15)
    expect(label().text()).toBe('Mario Kartoffel')
  })
})
