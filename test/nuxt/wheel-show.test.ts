import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { DOMWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import { wheelPoint } from '~/utils/wheel-look'
import { GAME_NAME_MAX, type HostGameFacts, type RoundGame } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'
import { EXCLUDED } from '../../scripts/browser/dark-read.mjs'
import { stubInView } from './in-view'

// The Lucky Wheel drawn as the Show-Rad (#519, spec #503): the rim of bulbs, a pin at every slice edge, the flapper, the fixed
// colours, and what a screen reader hears of it. Everything is still: the bulbs and the flapper move with #521 and #522.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const iso = (ms: number) => new Date(ms).toISOString()

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

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
const restOf = (n: number, name = 'Halo') => wheelOf(null, { count: n, slices: Array.from({ length: n }, (_, index) => ({ id: `s${index}`, name: index === 0 ? name : `Spiel ${index}` })) })

let serverMs = START - 1000
const serverNow = vi.fn(() => serverMs)
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean, hostGames?: Record<string, HostGameFacts> | null } = {}) {
  page = await mountSuspended(LuckyWheel, { props: { wheel, hidden: false, isHost: false, serverNow, ...props } })
  await flushPromises()
  return page
}

async function at(ms: number) {
  serverMs = ms
  vi.advanceTimersByTime(50)
  await flushPromises()
}

const all = (selector: string) => page!.findAll(selector)
const one = (testId: string) => page!.get(`[data-testid="${testId}"]`)
const disc = () => one('wheel-disc').element as HTMLElement

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = START - 1000
  serverNow.mockClear()
  stubInView()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.removeProperty('--cp-motion')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the rim at rest', () => {
  it('has 24 bulbs, the even ones lit, and a flapper hanging straight down in place of the old pointer', async () => {
    await mount(wheelOf(null))

    const bulbs = all('[data-testid="wheel-bulb"]')
    expect(bulbs).toHaveLength(24)
    expect(bulbs.filter((bulb: DOMWrapper<Element>) => bulb.attributes('data-lit') === 'true')).toHaveLength(12)
    bulbs.forEach((bulb: DOMWrapper<Element>, index: number) => expect(bulb.attributes('data-lit')).toBe(index % 2 === 0 ? 'true' : 'false'))

    expect(all('[data-testid="wheel-flapper"]')).toHaveLength(1)
    expect(one('wheel-flapper-arm').attributes('transform')).toBe('rotate(0 22 10)')
    expect(page!.html()).not.toContain('M182,-6')
  })

  it('keeps the bulbs and the flapper outside the rotor and the pins inside it', async () => {
    await mount(wheelOf(null))

    const rotor = one('wheel-rotor').element
    expect(rotor.querySelector('[data-testid="wheel-bulbs"]')).toBeNull()
    expect(rotor.querySelector('[data-testid="wheel-flapper"]')).toBeNull()
    expect(rotor.querySelectorAll('[data-testid="wheel-pin"]')).toHaveLength(3)
    expect(one('wheel-bulbs').element.closest('[data-testid="wheel-rotor"]')).toBeNull()
    expect(one('wheel-flapper').element.closest('[data-testid="wheel-rotor"]')).toBeNull()
  })

  it.each([2, 9, 30])('puts a pin at every slice edge of a wheel of %i games', async (n) => {
    await mount(restOf(n))

    const pins = all('[data-testid="wheel-pin"]')
    expect(pins).toHaveLength(n)
    pins.forEach((pin: DOMWrapper<Element>, index: number) => {
      const expected = wheelPoint((index * 360) / n, 170)
      expect(Number(pin.attributes('cx'))).toBeCloseTo(expected.x, 1)
      expect(Number(pin.attributes('cy'))).toBeCloseTo(expected.y, 1)
    })
  })

  it('has no pin on an empty wheel and one on a wheel of one game', async () => {
    await mount(restOf(0))
    expect(all('[data-testid="wheel-pin"]')).toHaveLength(0)
    page!.unmount()

    await mount(restOf(1))
    expect(all('[data-testid="wheel-pin"]')).toHaveLength(1)
  })

  it('still labels 30 games with the longest name as before (#263)', async () => {
    await mount(restOf(30, 'A'.repeat(GAME_NAME_MAX)))

    expect(all('[data-testid="wheel-pin"]')).toHaveLength(30)
    expect(one('wheel-label-0').text()).toBe(`${'A'.repeat(21)}…`)
    expect(one('wheel-label-0').attributes('font-size')).toBe('9')
    expect(Number(one('wheel-label-1').attributes('font-size'))).toBeCloseTo(230 / 30 + 6, 5)
  })

  it('gives a Member under a Hidden wheel the same pins as the placeholders', async () => {
    await mount(wheelOf(null, { slices: null }), { hidden: true })

    expect(all('[data-testid="wheel-pin"]')).toHaveLength(3)
    expect(page!.text().match(/\?\?\?/g)).toHaveLength(3)
  })
})

describe('the pins during a spin and its removal', () => {
  it('has a pin for each slice of the spin while it runs, and one fewer once the drawn slice has left', async () => {
    await mount(wheelOf(spinOf()))

    await at(START + 3000)
    expect(all('[data-testid="wheel-pin"]')).toHaveLength(4)

    await at(STOP + 2800 + 700)
    expect(all('[data-testid="wheel-pin"]')).toHaveLength(3)
  })

  it('draws the same wheel under reduced motion', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    await mount(wheelOf(spinOf()))

    await at(START + 3000)
    expect(all('[data-testid="wheel-pin"]')).toHaveLength(4)
    expect(all('[data-testid="wheel-bulb"]')).toHaveLength(24)
  })
})

describe('what a screen reader gets', () => {
  it('hides the bulbs, the pins and the flapper, and names none of them', async () => {
    await mount(wheelOf(null))

    for (const id of ['wheel-bulbs', 'wheel-pins', 'wheel-flapper']) {
      const group = one(id)
      expect(group.attributes('aria-hidden')).toBe('true')
      expect(group.element.querySelectorAll('[aria-label], [role], title, text')).toHaveLength(0)
    }
  })

  it('keeps one image named for the count, and a status line outside the disc that is empty at rest', async () => {
    await mount(wheelOf(null))

    const images = all('[role="img"]')
    expect(images).toHaveLength(1)
    expect(images[0]!.attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
    const status = page!.get('[role="status"]')
    expect(disc().contains(status.element)).toBe(false)
    expect(status.text()).toBe('')
  })

  it('announces the result at the stop as before', async () => {
    await mount(wheelOf(spinOf({ game: halo })))

    await at(STOP + 100)
    expect(page!.get('[role="status"]').text()).toBe('Glücksrad: Halo')
  })
})

describe('the colours are fixed (#519)', () => {
  const colours = () => Array.from(disc().querySelectorAll('*')).flatMap(element => [
    ...['fill', 'stroke'].flatMap(name => element.getAttribute(name) ?? []),
    ...(['fill', 'stroke', 'color', 'background', 'backgroundColor'] as const).flatMap(name => (element as SVGElement).style?.[name] || []),
  ])

  it('writes every colour inside the disc as a hex literal, with no theme token and no currentColor', async () => {
    await mount(restOf(5))

    const used = colours()
    expect(used.length).toBeGreaterThan(50)
    for (const value of used) expect(value).toMatch(/^(#[0-9a-f]{6}|none)$/)
    expect(disc().outerHTML).not.toContain('var(')
    expect(disc().outerHTML).not.toContain('currentColor')
  })

  it('fills five slices with the four fills and the surface colour for the last one', async () => {
    await mount(restOf(5))

    const fills = all('[data-testid="wheel-slice"]').map((slice: DOMWrapper<Element>) => slice.attributes('fill'))
    expect(fills).toEqual(['#ffd23f', '#2ec4b6', '#ff70c3', '#3a86ff', '#fff9ef'])
  })

  it('draws the same disc in Dunkel as in Hell', async () => {
    await mount(restOf(5))
    const hell = disc().outerHTML

    document.documentElement.setAttribute('data-theme', 'dark')
    await flushPromises()

    expect(disc().outerHTML).toBe(hell)
  })
})

describe('the size', () => {
  const sized = () => {
    expect(one('wheel-disc').classes()).toEqual(expect.arrayContaining(['aspect-square', 'max-w-[340px]', 'md:max-w-[420px]']))
    expect(one('wheel-disc').get('svg').attributes('viewBox')).toBe('0 0 400 400')
  }

  it('keeps the box and the viewBox at rest and mid-spin', async () => {
    await mount(wheelOf(spinOf()))
    sized()

    await at(START + 3000)
    sized()
  })
})

describe('the Dunkel-Check leaves the wheel out and still reads the card around it', () => {
  it('matches only the disc, which holds the svg and the flapper but not the heading, the status line or the result card', async () => {
    await mount(wheelOf(spinOf({ game: halo })))
    await at(STOP + 100)

    const root = page!.element as HTMLElement
    const matched = EXCLUDED.flatMap(entry => Array.from(root.querySelectorAll(entry.selector)))
    expect(matched).toEqual([disc()])
    expect(disc().querySelector('svg')).not.toBeNull()
    expect(disc().querySelector('[data-testid="wheel-flapper"]')).not.toBeNull()
    expect(disc().querySelector('h2')).toBeNull()
    expect(disc().querySelector('[role="status"]')).toBeNull()
    expect(disc().querySelector('[data-testid="game-tile"], article')).toBeNull()
    expect(root.querySelector('h2')!.closest('[data-testid="wheel-disc"]')).toBeNull()
    expect(page!.get('[role="status"]').element.closest('[data-testid="wheel-disc"]')).toBeNull()
    expect(page!.text()).toContain('Halo')
  })
})
