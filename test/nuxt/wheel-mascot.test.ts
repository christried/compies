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
const serverNow = () => serverMs
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

/**
 * The wheel card's width as its ResizeObserver reports it (#604): happy-dom's observer does nothing, so this stub reports `px` once when the card
 * is observed, and `resize` reports a new width the way a real observer would. `seen` counts what was observed and how often it was disconnected.
 */
function cardWidth(px: number) {
  const seen = { observed: [] as Element[], disconnects: 0 }
  let width = px
  let report: ResizeObserverCallback | undefined
  class Stub {
    constructor(callback: ResizeObserverCallback) {
      report = callback
    }

    observe(target: Element) {
      seen.observed.push(target)
      report?.([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], null as unknown as ResizeObserver)
    }

    unobserve() {}

    disconnect() {
      seen.disconnects++
    }
  }
  vi.stubGlobal('ResizeObserver', Stub)
  return {
    seen,
    resize(next: number) {
      width = next
      report?.([{ target: seen.observed[0]!, contentRect: { width: next } } as unknown as ResizeObserverEntry], null as unknown as ResizeObserver)
    },
  }
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

describe('a late joiner', () => {
  it('who opens the page 4000 ms into the spin finds him on and holding his breath, as one who watched', async () => {
    // The one who watched: the clock moves frame by frame to the same instant.
    await mount(wheelOf(spinOf()))
    for (let ms = START - 1000; ms <= START + 4000; ms += 100) await at(ms)
    await at(START + 4000)
    const watched = seen()
    page!.unmount()

    serverMs = START + 4000
    await mount(wheelOf(spinOf()))
    await flushPromises()

    expect(watched).toEqual({ stage: 'on', state: 'suspense' })
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

  it('moves with the wheel, on one clock: at the stop he cheers in the frame the wheel announces its result, with nothing of his in it', async () => {
    await mount(wheelOf(spinOf(6000, { game: halo })))
    const rotor = () => page!.get('[data-testid="wheel-rotor"]').attributes('style')

    await at(START + 3700)
    const turning = rotor()
    await at(START + 5999)
    expect(rigState()).toBe('suspense')
    expect(page!.get('[role="status"]').text()).toBe('')
    // The wheel is turning while he holds his breath: both are seen to move.
    expect(rotor()).not.toBe(turning)

    await at(START + 6000)
    expect(mascot().exists()).toBe(true)
    expect(rigState()).toBe('cheer')
    expect(page!.get('[role="status"]').text()).toBe('Glücksrad: Halo')
  })

  it('shows no game, no slice and no number in what he is made of', async () => {
    await mount(wheelOf(spinOf(6000, { game: halo, resultIndex: 2, labels: ['Halo', 'Kart', 'Pong', 'Schach'] })), { hidden: true })

    await at(START + 3700)
    const markup = mascot().element.outerHTML
    for (const secret of ['Halo', 'Kart', 'Pong', 'Schach', 'g-halo', 'd1', 'r1']) expect(markup).not.toContain(secret)
    expect(Object.keys(mascot().attributes()).sort()).toEqual(['aria-hidden', 'class', 'data-ready', 'data-stage', 'data-testid', 'data-width', 'style'])
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
    cardWidth(300)
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    expect(mascot().attributes('data-width')).toBe('sm')
    expect(mascot().get('.compibert-rig').attributes('style')).toContain('width: 150px')
  })

  it('is md on a card that holds the wheel from the theme\'s md up, not from the narrower width `useRoomy` has: 232 px', async () => {
    wide(true)
    cardWidth(1020)
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    expect(mascot().attributes('data-width')).toBe('md')
    expect(mascot().attributes('style')).toContain('--wm-left: max(50% + 24px, 100% - 120px)')
    expect(mascot().attributes('style')).toContain('top: 18px')
    expect(mascot().get('.compibert-rig').attributes('style')).toContain('width: 232px')
  })

  // The card's content width decides, on both sides of the threshold: 612 px at md up (the wheel 420), 532 px below (the wheel 340) (#604).
  it.each([
    [true, 611, 'sm', 150],
    [true, 612, 'md', 232],
    [false, 531, 'sm', 150],
    [false, 532, 'md', 232],
  ])('with md %s and a card of %i px is %s: %i px', async (isWide, card, width, size) => {
    wide(isWide)
    cardWidth(card)
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    expect(mascot().attributes('data-width')).toBe(width)
    expect(mascot().get('.compibert-rig').attributes('style')).toContain(`width: ${size}px`)
  })

  it('follows the card as it is resized: the big bust once the card holds it, the small one again when it narrows', async () => {
    wide(true)
    const card = cardWidth(600)
    await mount(wheelOf(spinOf()))
    await at(START + 1000)
    expect(mascot().attributes('data-width')).toBe('sm')

    card.resize(640)
    await flushPromises()
    expect(mascot().attributes('data-width')).toBe('md')
    expect(mascot().get('.compibert-rig').attributes('style')).toContain('width: 232px')

    card.resize(600)
    await flushPromises()
    expect(mascot().attributes('data-width')).toBe('sm')
  })

  it('watches the wheel card and lets go of it when the wheel leaves the page', async () => {
    wide(true)
    const card = cardWidth(1020)
    await mount(wheelOf(null))

    expect(card.seen.observed).toEqual([page!.find('section').element])
    expect(card.seen.disconnects).toBe(0)
    page!.unmount()
    page = undefined
    expect(card.seen.disconnects).toBe(1)
  })

  it('is sm while the card is not measured: no observer on the page, no error', async () => {
    vi.unstubAllGlobals()
    wide(true)
    await mount(wheelOf(spinOf()))
    await at(START + 1000)

    expect(mascot().attributes('data-width')).toBe('sm')
    expect(mascot().get('.compibert-rig').attributes('style')).toContain('width: 150px')
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

  it('puts his left edge and his hiding on his box as utilities, with no rule of his own in the page (#584)', async () => {
    const one = await mountSuspended(LuckyWheelMascot, { props })
    await flushPromises()

    expect(one.get('[data-testid="wheel-mascot"]').classes()).toEqual(expect.arrayContaining(['wheel-mascot', 'left-(--wm-left)', 'data-[ready=false]:opacity-0']))
    one.unmount()
  })

  it('is invisible until the travel is built and shows once it is', async () => {
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

  it('stays invisible and still when the chunk fails, and asks again only with the next spin', async () => {
    let fail = (_reason: Error) => {}
    chunk.held = new Promise<void>((_, reject) => (fail = reject))
    chunk.held.catch(() => {})
    const one = await mountSuspended(LuckyWheelMascot, { props })
    await flushPromises()

    fail(new Error('chunk'))
    await flushPromises()

    const element = one.get('[data-testid="wheel-mascot"]')
    expect(element.attributes('data-ready')).toBe('false')
    expect(one.find('.compibert-rig').exists()).toBe(true)
    expect(element.attributes('style')).not.toMatch(/opacity|transform/)

    chunk.held = null
    await one.setProps({ now: START + 2000 })
    await flushPromises()
    expect(one.get('[data-testid="wheel-mascot"]').attributes('data-ready')).toBe('false')
    one.unmount()

    const fresh = await mountSuspended(LuckyWheelMascot, { props })
    await flushPromises()
    expect(fresh.get('[data-testid="wheel-mascot"]').attributes('data-ready')).toBe('true')
    fresh.unmount()
  })

  it('leaves nothing behind when he is unmounted while the chunk is still arriving', async () => {
    // The tweens on his box, not the global timeline's size: the rigs of other tests keep loops of their own there.
    const gsap = await loadGsap()
    let release = () => {}
    chunk.held = new Promise<void>(resolve => (release = resolve))
    const one = await mountSuspended(LuckyWheelMascot, { props })
    await flushPromises()
    const element = one.get('[data-testid="wheel-mascot"]').element as HTMLElement

    one.unmount()
    release()
    await flushPromises()

    expect(gsap.getTweensOf(element)).toHaveLength(0)
    expect(element.style.transform).toBe('')
  })

  it('builds his travel again for the other width: the new places, one timeline', async () => {
    const gsap = await loadGsap()
    const one = await mountSuspended(LuckyWheelMascot, { props: { ...props, now: START } })
    await flushPromises()
    const element = one.get('[data-testid="wheel-mascot"]').element as HTMLElement
    // His travel is four tweens on his box; a rebuild that left the old timeline alive would double them.
    expect(gsap.getTweensOf(element)).toHaveLength(4)
    expect(gsap.getProperty(element, 'x')).toBe(-130)
    expect(gsap.getProperty(element, 'y')).toBe(100)

    await one.setProps({ width: 'sm' })
    await flushPromises()

    expect(gsap.getProperty(element, 'x')).toBe(-100)
    expect(gsap.getProperty(element, 'y')).toBe(80)
    expect(element.getAttribute('data-ready')).toBe('true')
    expect(gsap.getTweensOf(element)).toHaveLength(4)
    one.unmount()
  })
})
