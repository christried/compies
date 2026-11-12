import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import LuckyWheelMascot from '~/components/LuckyWheelMascot.vue'
import { loadGsap } from '~/utils/gsap'
import { mascotBox } from '~/utils/wheel-mascot'
import type { RoundGame } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'
import { stubInView } from './in-view'

// Compibert at the wheel (#526, spec #503, hand-off note 16): he is not there at rest, comes up at the spin's start, is excited, holds his
// breath at the brake, cheers at the stop, and leaves with the drawn slice; a late joiner finds him where he is. The server's clock is a
// variable the tests move, as in lucky-wheel.test.ts; the state is read off the rig's `data-state`, the stage off the box's `data-stage`.

// A test can hold the GSAP chunk back, to see him before the travel is built (the memoised import resolves at once after the first test).
const chunk = vi.hoisted(() => ({ held: null as Promise<void> | null }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return async () => {
    await chunk.held
    return real()
  }
})

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

function spinOf(length = 6000, fields: Partial<SpinView> = {}): SpinView {
  return {
    roundId: 'r1', drawId: 'd1', spinStartAt: iso(START), stopAt: iso(START + length), slices: 4, resultIndex: 2, resultOffset: 0.25,
    labels: ['Halo', 'Kart', 'Pong', 'Schach'], game: null, current: true, ...fields,
  }
}
const wheelOf = (spin: SpinView | null, fields: Partial<WheelView> = {}): WheelView => ({
  count: 3, slices: [{ id: 'a', name: 'Halo' }, { id: 'b', name: 'Kart' }, { id: 'c', name: 'Schach' }], spin, vetoes: { left: [], own: null, revealed: null, draw: null }, ...fields,
})
const slicesOf = (n: number): WheelView['slices'] => Array.from({ length: n }, (_, index) => ({ id: `s${index}`, name: `Spiel ${index}` }))

let serverMs = START - 1000
const serverNow = vi.fn(() => serverMs)
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean } = {}) {
  page = await mountSuspended(LuckyWheel, { props: { wheel, hidden: false, isHost: false, serverNow, ...props } })
  await flushPromises()
  return page
}

async function at(ms: number) {
  serverMs = ms
  vi.advanceTimersByTime(50)
  await flushPromises()
}

/** `matchMedia` that says whether the md query matches: the wheel's width is `md` or `sm` by it. */
function wide(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} }))
}

const mascot = () => page!.find('[data-testid="wheel-mascot"]')
const stage = () => mascot().attributes('data-stage')
const rigState = () => mascot().get('.compibert-rig').attributes('data-state')
/** The mascot's stage and rig state, or null while he is not there. */
const seen = () => (mascot().exists() ? { stage: stage(), state: rigState() } : null)

// The GSAP chunk is loaded once, with real timers, so that under the fake ones it arrives at once (the rig and the travel both wait for it).
beforeAll(async () => {
  await loadGsap()
})

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = START - 1000
  serverNow.mockClear()
  stubInView()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  chunk.held = null
  document.documentElement.style.removeProperty('--cp-motion')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('at rest', () => {
  it('is not there on a wheel that has not spun', async () => {
    await mount(wheelOf(null))

    expect(mascot().exists()).toBe(false)
    expect(page!.find('.compibert-rig').exists()).toBe(false)
  })

  it('is not there before the spin starts, though the spin is known', async () => {
    await mount(wheelOf(spinOf()))

    expect(seen()).toBeNull()
    await at(START - 1)
    expect(seen()).toBeNull()
  })

  it('is not there on a wheel whose spin ended long ago, and loads no rig', async () => {
    serverMs = START + 60_000
    await mount(wheelOf(spinOf()))

    expect(seen()).toBeNull()
    expect(page!.find('.compibert-rig').exists()).toBe(false)
  })
})

describe('a spin of 6 s', () => {
  it('has him come up at the start, excited', async () => {
    await mount(wheelOf(spinOf()))

    await at(START)
    expect(seen()).toEqual({ stage: 'in', state: 'excited' })
    await at(START + 449)
    expect(stage()).toBe('in')
    await at(START + 450)
    expect(seen()).toEqual({ stage: 'on', state: 'excited' })
  })

  it('holds his breath at the brake, 3.6 s in', async () => {
    await mount(wheelOf(spinOf()))

    await at(START + 3599)
    expect(rigState()).toBe('excited')
    await at(START + 3600)
    expect(rigState()).toBe('suspense')
    await at(START + 5999)
    expect(rigState()).toBe('suspense')
  })

  it('cheers at the stop, is idle 1.6 s later and leaves with the drawn slice at the stop + 2.2 s', async () => {
    await mount(wheelOf(spinOf()))

    await at(START + 6000)
    expect(seen()).toEqual({ stage: 'on', state: 'cheer' })
    await at(START + 6000 + 1599)
    expect(rigState()).toBe('cheer')
    await at(START + 6000 + 1600)
    expect(seen()).toEqual({ stage: 'on', state: 'idle' })
    await at(START + 6000 + 2200)
    expect(seen()).toEqual({ stage: 'out', state: 'idle' })
  })

  it('is gone 0.4 s after he started to leave, and the rig with him', async () => {
    await mount(wheelOf(spinOf()))

    await at(START + 6000 + 2599)
    expect(mascot().exists()).toBe(true)
    await at(START + 6000 + 2600)
    expect(mascot().exists()).toBe(false)
    expect(page!.find('.compibert-rig').exists()).toBe(false)
    // The wheel's own removal of the drawn slice goes on after him.
    await at(START + 6000 + 3000)
    expect(mascot().exists()).toBe(false)
  })
})

describe('the brake follows the length of the spin', () => {
  it.each([[7000, 4200], [8500, 5100], [10_000, 6000]])('of %i ms is at %i ms', async (length, brake) => {
    await mount(wheelOf(spinOf(length)))

    await at(START + brake - 1)
    expect(rigState()).toBe('excited')
    await at(START + brake)
    expect(rigState()).toBe('suspense')
    await at(START + length)
    expect(rigState()).toBe('cheer')
  })
})

describe('a late joiner', () => {
  it.each([[100, 'in', 'excited'], [2000, 'on', 'excited'], [4000, 'on', 'suspense'], [6500, 'on', 'cheer'], [8000, 'on', 'idle'], [8300, 'out', 'idle']])('who opens the page %i ms into the spin finds him %s and %s, as one who watched', async (offset, wantedStage, wantedState) => {
    // The one who watched: the clock moves frame by frame to the same instant.
    await mount(wheelOf(spinOf()))
    for (let ms = START - 1000; ms <= START + offset; ms += 100) await at(ms)
    await at(START + offset)
    const watched = seen()
    page!.unmount()

    serverMs = START + offset
    await mount(wheelOf(spinOf()))
    await flushPromises()

    expect(watched).toEqual({ stage: wantedStage, state: wantedState })
    expect(seen()).toEqual(watched)
  })

  it('finds nobody after the way out', async () => {
    serverMs = START + 6000 + 2700
    await mount(wheelOf(spinOf()))

    expect(seen()).toBeNull()
  })
})

describe('a Hidden wheel', () => {
  it.each([[false], [true]])('holds suspense until the stop + 0.5 s for a Member and the Host alike (host: %s), then cheers', async (isHost) => {
    await mount(wheelOf(spinOf(), { slices: isHost ? slicesOf(3) : null }), { hidden: true, isHost })

    await at(START + 6000)
    expect(rigState()).toBe('suspense')
    await at(START + 6499)
    expect(rigState()).toBe('suspense')
    await at(START + 6500)
    expect(rigState()).toBe('cheer')
    await at(START + 6000 + 2100)
    expect(rigState()).toBe('idle')
  })

  it('leaves at the stop + 2.8 s and is gone at + 3.2 s', async () => {
    await mount(wheelOf(spinOf()), { hidden: true })

    await at(START + 6000 + 2799)
    expect(stage()).toBe('on')
    await at(START + 6000 + 2800)
    expect(stage()).toBe('out')
    await at(START + 6000 + 3200)
    expect(mascot().exists()).toBe(false)
  })

  it('is as excited and as breathless as on an open wheel until the stop', async () => {
    await mount(wheelOf(spinOf()), { hidden: true })

    await at(START + 1000)
    expect(rigState()).toBe('excited')
    await at(START + 3600)
    expect(rigState()).toBe('suspense')
  })
})

describe('reduced motion', () => {
  beforeEach(() => document.documentElement.style.setProperty('--cp-motion', 'reduced'))

  it('is there from the start, follows the same server times and is gone 0.22 s after he started to leave', async () => {
    await mount(wheelOf(spinOf()))

    await at(START)
    expect(seen()).toEqual({ stage: 'in', state: 'excited' })
    await at(START + 220)
    expect(stage()).toBe('on')
    await at(START + 3600)
    expect(rigState()).toBe('suspense')
    await at(START + 6000)
    expect(rigState()).toBe('cheer')
    await at(START + 6000 + 2200)
    expect(stage()).toBe('out')
    await at(START + 6000 + 2420)
    expect(mascot().exists()).toBe(false)
  })

  it('cheers a Hidden wheel at the stop + 0.5 s, as the note says', async () => {
    await mount(wheelOf(spinOf()), { hidden: true })

    await at(START + 6000)
    expect(rigState()).toBe('suspense')
    await at(START + 6500)
    expect(rigState()).toBe('cheer')
  })
})

describe('the number of slices does not matter: he is behind the wheel', () => {
  it.each([0, 1, 2, 30])('has the same place, stage and state at %i slices', async (n) => {
    wide(false)
    await mount(wheelOf(spinOf(6000, { slices: n, labels: Array.from({ length: n }, (_, index) => `Spiel ${index}`), resultIndex: Math.max(n - 1, 0) }), { count: n, slices: slicesOf(n) }))

    await at(START + 3700)
    expect(seen()).toEqual({ stage: 'on', state: 'suspense' })
    expect(mascot().attributes('style')).toContain('--wm-left: max(50% + 24px, 100% - 142px)')
    expect(mascot().attributes('style')).toContain('top: -20px')
    expect(mascot().attributes('style')).toContain('width: 150px')
  })
})

describe('what he leaves alone', () => {
  it('is hidden from assistive technology, takes no focus and says nothing', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    const box = mascot()
    expect(box.attributes('aria-hidden')).toBe('true')
    expect(box.classes()).toContain('pointer-events-none')
    expect(box.attributes('tabindex')).toBeUndefined()
    expect(box.find('a, button, input, [tabindex]').exists()).toBe(false)
    expect(box.text()).toBe('')
    expect(box.find('title, desc, [aria-label], [role]').exists()).toBe(false)
  })

  it('stands outside the image the wheel is and outside its live region', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    const images = page!.findAll('[role="img"]')
    expect(images).toHaveLength(1)
    expect(images[0]!.attributes('aria-label')).toBe('Glücksrad mit 4 Spielen')
    expect(images[0]!.element.contains(mascot().element)).toBe(false)
    expect(page!.get('[role="status"]').element.contains(mascot().element)).toBe(false)
    expect(page!.get('[role="status"]').text()).toBe('')
  })

  it('announces the result at the stop as before, with nothing of his', async () => {
    await mount(wheelOf(spinOf(6000, { game: halo })))

    await at(START + 6100)
    expect(mascot().exists()).toBe(true)
    expect(page!.get('[role="status"]').text()).toBe('Glücksrad: Halo')
  })

  it('shows no game, no slice and no number in what he is made of', async () => {
    await mount(wheelOf(spinOf(6000, { game: halo, resultIndex: 2, labels: ['Halo', 'Kart', 'Pong', 'Schach'] })), { hidden: true })

    await at(START + 3700)
    const markup = mascot().element.outerHTML
    for (const secret of ['Halo', 'Kart', 'Pong', 'Schach', 'g-halo', 'd1', 'r1']) expect(markup).not.toContain(secret)
    expect(Object.keys(mascot().attributes()).sort()).toEqual(['aria-hidden', 'class', 'data-ready', 'data-stage', 'data-testid', 'data-width', 'style'])
  })

  it('does not read the server\'s clock for himself: a frame costs the wheel the same reads with and without him', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 1000)
    serverNow.mockClear()
    await at(START + 1050)
    const withHim = serverNow.mock.calls.length
    await at(START + 6000 + 2650)
    expect(mascot().exists()).toBe(false)
    serverNow.mockClear()
    await at(START + 6000 + 2700)
    const without = serverNow.mock.calls.length

    expect(withHim).toBeGreaterThan(0)
    expect(withHim).toBe(without)
  })

  it('does not change the wheel\'s size or the card: the box is positioned and takes no room', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    expect(mascot().classes()).toContain('absolute')
    expect(mascot().element.parentElement?.getAttribute('data-testid')).toBe('wheel-disc')
    expect(mascot().element.parentElement?.className).toContain('isolate')
    expect(page!.get('[role="img"]').classes()).toEqual(expect.arrayContaining(['relative', 'z-1']))
    expect(mascot().classes()).toContain('z-0')
  })
})

describe('the width', () => {
  it('is sm on a phone: 150 px, from the wheel\'s upper right', async () => {
    wide(false)
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    expect(mascot().attributes('data-width')).toBe('sm')
    expect(mascot().get('.compibert-rig').attributes('style')).toContain('width: 150px')
  })

  it('is md from the theme\'s md up, not from the narrower width `useRoomy` has: 232 px', async () => {
    wide(true)
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    expect(mascot().attributes('data-width')).toBe('md')
    expect(mascot().attributes('style')).toContain('--wm-left: max(50% + 24px, 100% - 120px)')
    expect(mascot().attributes('style')).toContain('top: 18px')
    expect(mascot().get('.compibert-rig').attributes('style')).toContain('width: 232px')
  })
})

describe('the mascot on its own', () => {
  const spin = { spinStartAt: START, stopAt: START + 8000 }
  const props = { width: 'md' as const, spin, hidden: false, now: START + 1000, reduced: false }

  it.each(['md', 'sm'] as const)('is a %s bust with the box the note gives, a bust rig of its size, and nothing on the stage', async (width) => {
    const box = mascotBox(width)
    const one = await mountSuspended(LuckyWheelMascot, { props: { ...props, width } })
    await flushPromises()

    const element = one.get('[data-testid="wheel-mascot"]')
    expect(element.attributes('style')).toContain(`--wm-left: ${box.left}`)
    expect(element.attributes('style')).toContain(`top: ${box.top}px`)
    expect(element.attributes('style')).toContain(`width: ${box.size}px`)
    expect(one.get('.compibert-rig').attributes('style')).toContain(`width: ${box.size}px`)
    expect(one.get('svg').attributes('viewBox')).toBe('150 36 254 254')
    one.unmount()
  })

  it('renders nothing without a clock, as on the server', async () => {
    const one = await mountSuspended(LuckyWheelMascot, { props: { ...props, now: null } })

    expect(one.find('[data-testid="wheel-mascot"]').exists()).toBe(false)
    one.unmount()
  })

  it('is invisible until the travel is built and shows once it is; a chunk that never arrives leaves him invisible', async () => {
    let release = () => {}
    chunk.held = new Promise<void>(resolve => (release = resolve))
    const one = await mountSuspended(LuckyWheelMascot, { props })
    await flushPromises()
    expect(one.get('[data-testid="wheel-mascot"]').attributes('data-ready')).toBe('false')

    release()
    await flushPromises()

    expect(one.get('[data-testid="wheel-mascot"]').attributes('data-ready')).toBe('true')
    one.unmount()
  })
})
