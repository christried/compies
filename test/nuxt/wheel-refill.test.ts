import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import { GAME_NAME_MAX } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'
import { stubInView } from './in-view'

// The refill (#524, spec #503, 04-motion § Lucky Wheel, put back and refill): when the games on a resting wheel change, the slices move to
// their new places over 0.6 s and a new slice scales in; nothing of it runs during a spin or its removal, for a Member who opens the page
// afterwards, or out of view. It runs on the page's own clock from the moment the data arrives, not on the server's.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const iso = (ms: number) => new Date(ms).toISOString()

function spinOf(fields: Partial<SpinView> = {}): SpinView {
  return {
    roundId: 'r1', drawId: 'd1', spinStartAt: iso(START), stopAt: iso(STOP), slices: 4, resultIndex: 2, resultOffset: 0.25,
    labels: ['Spiel 0', 'Spiel 1', 'Spiel 2', 'Spiel 3'], game: null, current: true, ...fields,
  }
}
const wheelOf = (spin: SpinView | null, fields: Partial<WheelView> = {}): WheelView => ({
  count: 3, slices: [], spin, vetoes: { left: [], own: null, revealed: null, draw: null }, ...fields,
})
/** The games `ids` on a resting wheel, named after their ids. */
const gamesOf = (ids: string[], spin: SpinView | null = null) => wheelOf(spin, { count: ids.length, slices: ids.map(id => ({ id, name: `Spiel ${id}` })) })
/** A resting wheel of `n` games `s0` … `s(n-1)`. */
const restOf = (n: number) => gamesOf(Array.from({ length: n }, (_, index) => `s${index}`))
/** A Member's view of a Hidden wheel: the count only. */
const hiddenOf = (n: number) => wheelOf(null, { count: n, slices: null })

let serverMs = START - 1000
const serverNow = vi.fn(() => serverMs)
let page: VueWrapper | undefined
const extras: VueWrapper[] = []

async function mount(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean } = {}) {
  const wrapper = await mountSuspended(LuckyWheel, { props: { wheel, hidden: false, isHost: false, serverNow, ...props } })
  await flushPromises()
  return wrapper
}
/** A second wheel of the same props, for „the same as a fresh mount“. */
async function fresh(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean } = {}) {
  const wrapper = await mount(wheel, props)
  extras.push(wrapper)
  return wrapper
}

/** The wheel's data changes now. */
async function change(wheel: WheelView) {
  await page!.setProps({ wheel })
  await flushPromises()
}
/** The page's own clock runs on by `ms`. */
async function local(ms: number) {
  vi.advanceTimersByTime(ms)
  await flushPromises()
}
/** The server's clock stands at `ms`, a frame on. */
async function at(ms: number) {
  serverMs = ms
  vi.advanceTimersByTime(50)
  await flushPromises()
}

const slicesOf = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="wheel-slice"]').map((slice: DOMWrapper<Element>) => slice.attributes('d'))
const labelsOf = (wrapper: VueWrapper) => wrapper.findAll('text[data-testid^="wheel-label-"]').map((label: DOMWrapper<Element>) => label.text())
const pinsOf = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="wheel-pin"]').length
const litOf = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="wheel-bulb"]').map((bulb: DOMWrapper<Element>) => bulb.attributes('data-lit'))
const opacityOf = (wrapper: VueWrapper) => (wrapper.get('[data-testid="wheel-rotor"]').element as HTMLElement).style.opacity

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = START - 1000
  serverNow.mockClear()
  stubInView()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  for (const wrapper of extras.splice(0)) wrapper.unmount()
  document.documentElement.style.removeProperty('--cp-motion')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a game put back at rest', () => {
  it('moves the slices over and scales the new one in, then stands where a fresh mount does', async () => {
    page = await mount(restOf(3))
    const before = slicesOf(page)
    expect(before).toHaveLength(3)

    await change(gamesOf(['s0', 's1', 'n', 's2']))
    // Right after: the old layout (the new slice has no width yet).
    expect(slicesOf(page)).toEqual(before)

    await local(150)
    const middle = slicesOf(page)
    const after = slicesOf(await fresh(gamesOf(['s0', 's1', 'n', 's2'])))
    expect(middle).toHaveLength(4)
    for (const d of middle) {
      expect(before).not.toContain(d)
      expect(after).not.toContain(d)
    }
    expect(labelsOf(page)).toEqual(['Spiel s0', 'Spiel s1', 'Spiel n', 'Spiel s2'])

    await local(550)
    expect(slicesOf(page)).toEqual(after)
    expect(pinsOf(page)).toBe(4)
    expect(opacityOf(page)).toBe('')
  })

  it('shows the new slice\'s name once its slice is wider than 4 degrees', async () => {
    page = await mount(restOf(3))
    await change(gamesOf(['s0', 's1', 'n', 's2']))
    expect(labelsOf(page)).not.toContain('Spiel n')

    await local(150)
    expect(labelsOf(page)).toContain('Spiel n')
  })
})

describe('a game taken off the wheel at rest', () => {
  it('lets the leaving slice close under its old name, then stands where a fresh mount does', async () => {
    page = await mount(gamesOf(['s0', 's1', 'n', 's2']))

    await change(restOf(3))
    await local(150)
    const middle = slicesOf(page)
    expect(middle).toHaveLength(4)
    expect(labelsOf(page)).toContain('Spiel n')
    expect(pinsOf(page)).toBe(4)

    await local(550)
    expect(slicesOf(page)).toEqual(slicesOf(await fresh(restOf(3))))
    expect(labelsOf(page)).not.toContain('Spiel n')
    expect(pinsOf(page)).toBe(3)
  })

  it('takes a pin away once its slice has closed to a twentieth of its share', async () => {
    page = await mount(gamesOf(['s0', 's1', 'n', 's2']))
    await change(restOf(3))

    await local(550)
    expect(pinsOf(page)).toBe(3)
  })
})

describe('around a spin', () => {
  const spinWheel = () => gamesOf(['s0', 's1', 's2'], spinOf())

  it('plays nothing when the spin takes the drawn game off the wheel, nor after its removal', async () => {
    page = await mount(restOf(4))
    await change(spinWheel())
    const twin = await fresh(spinWheel())
    expect(slicesOf(page)).toEqual(slicesOf(twin))

    await at(START + 500)
    expect(slicesOf(page)).toEqual(slicesOf(twin))

    // The removal ends at stop + 2.8 s; the wheel then shows the three games at once, with no frame of a redistribution on the way.
    const rest = slicesOf(await fresh(restOf(3)))
    for (const ms of [STOP + 3000, STOP + 3150, STOP + 3400, STOP + 4000]) {
      await at(ms)
      expect(slicesOf(page), `at stop + ${ms - STOP}`).toEqual(rest)
    }
  })

  it('shows nothing of a change that arrives during the spin until the removal is over, and then all of it at once', async () => {
    page = await mount(restOf(4))
    await change(spinWheel())
    await at(START + 1000)
    const during = slicesOf(page)

    await change(gamesOf(['s0', 's1', 's2', 'x', 'y'], spinOf()))
    expect(slicesOf(page)).toEqual(during)
    await at(START + 2000)
    expect(slicesOf(page)).toHaveLength(4)

    const rest = slicesOf(await fresh(gamesOf(['s0', 's1', 's2', 'x', 'y'])))
    await at(STOP + 3000)
    expect(slicesOf(page)).toEqual(rest)
    await at(STOP + 3200)
    expect(slicesOf(page)).toEqual(rest)
  })
})

describe('a Member who opens the page after the change', () => {
  it('sees the final layout at once and at every later moment, and no replay for the same games in a new array', async () => {
    page = await mount(restOf(4))
    const final = slicesOf(page)
    await local(700)
    expect(slicesOf(page)).toEqual(final)

    await change(restOf(4))
    expect(slicesOf(page)).toEqual(final)
    await local(150)
    expect(slicesOf(page)).toEqual(final)
  })

  it('changes a renamed game\'s label at once and moves nothing', async () => {
    page = await mount(restOf(3))
    const before = slicesOf(page)

    await change(wheelOf(null, { count: 3, slices: [{ id: 's0', name: 'Umbenannt' }, { id: 's1', name: 'Spiel s1' }, { id: 's2', name: 'Spiel s2' }] }))
    expect(labelsOf(page)).toEqual(['Umbenannt', 'Spiel s1', 'Spiel s2'])
    expect(slicesOf(page)).toEqual(before)
    await local(150)
    expect(slicesOf(page)).toEqual(before)
  })
})

describe('a Member under a Hidden wheel', () => {
  it('sees the count change with placeholders, the last slice coming and going, and no game or id anywhere in the disc', async () => {
    page = await mount(hiddenOf(3), { hidden: true })
    const disc = () => (page!.get('[data-testid="wheel-disc"]').element as HTMLElement).outerHTML
    const noSecret = () => {
      // The names of this file's games are „Spiel s0“ and so on (the count's „Spielen“ in the accessible name is not one of them).
      expect(disc()).not.toMatch(/slot-|\bs\d+\b|Spiel s|Spiel n|Halo|Kart|Schach/)
      expect(labelsOf(page!).every(label => label === '???')).toBe(true)
    }
    const three = slicesOf(page)

    await change(hiddenOf(4))
    expect(page.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 4 Spielen')
    expect(slicesOf(page)).toEqual(three)
    noSecret()
    await local(150)
    expect(slicesOf(page)).toHaveLength(4)
    noSecret()
    await local(550)
    expect(slicesOf(page)).toEqual(slicesOf(await fresh(hiddenOf(4), { hidden: true })))
    noSecret()

    await change(hiddenOf(3))
    expect(page.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
    await local(150)
    expect(slicesOf(page)).toHaveLength(4)
    noSecret()
    await local(550)
    expect(slicesOf(page)).toEqual(three)
    noSecret()
  })
})

describe('under reduced motion', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
  })

  it('shows the new layout at once and fades the rotor in over 0.2 s', async () => {
    page = await mount(restOf(3))
    await change(restOf(4))

    expect(slicesOf(page)).toEqual(slicesOf(await fresh(restOf(4))))
    expect(Number(opacityOf(page))).toBe(0)
    await local(100)
    expect(Number(opacityOf(page))).toBeCloseTo(0.5, 1)
    await local(150)
    expect(opacityOf(page)).toBe('')
    expect(slicesOf(page)).toHaveLength(4)
  })

  it('leaves no slice of a game taken off the wheel', async () => {
    page = await mount(restOf(4))
    await change(restOf(3))

    expect(slicesOf(page)).toHaveLength(3)
    expect(labelsOf(page)).not.toContain('Spiel s3')
  })
})

describe('the bulbs and the pins', () => {
  it('keep their 24 bulbs as they were and follow the slices with a pin each', async () => {
    page = await mount(restOf(3))
    const lit = litOf(page)
    expect(pinsOf(page)).toBe(3)

    await change(gamesOf(['s0', 's1', 'n', 's2']))
    expect(pinsOf(page)).toBe(3)
    await local(150)
    expect(litOf(page)).toEqual(lit)
    expect(pinsOf(page)).toBe(4)
    await local(550)
    expect(litOf(page)).toEqual(lit)
    expect(pinsOf(page)).toBe(4)
  })
})

describe('the edges', () => {
  it('opens a wheel of no games as a full circle without a NaN', async () => {
    page = await mount(restOf(0))
    await change(restOf(1))
    for (const ms of [0, 100, 300, 500]) {
      await local(ms === 0 ? 0 : 100)
      expect(page.html()).not.toContain('NaN')
    }
    await local(300)
    expect(slicesOf(page)).toHaveLength(1)
    expect(slicesOf(page)[0]).toContain('A180,180')
  })

  it('closes a wheel of one game and says at once that it is empty', async () => {
    page = await mount(restOf(1))
    await change(restOf(0))
    expect(page.text()).toContain('Das Rad ist leer')
    await local(300)
    expect(page.html()).not.toContain('NaN')
    await local(400)
    expect(slicesOf(page)).toEqual([])
  })

  it('goes from 1 to 2 games and from 2 to 1', async () => {
    page = await mount(restOf(1))
    await change(restOf(2))
    await local(700)
    expect(slicesOf(page)).toEqual(slicesOf(await fresh(restOf(2))))
    await change(restOf(1))
    await local(700)
    expect(slicesOf(page)).toEqual(slicesOf(await fresh(restOf(1))))
  })

  it('cuts the long name of a game put back on a wheel of 30 as before', async () => {
    page = await mount(restOf(30))
    const ids = Array.from({ length: 30 }, (_, index) => `s${index}`)
    ids.splice(15, 0, 'long')
    await change(wheelOf(null, { count: 31, slices: ids.map(id => ({ id, name: id === 'long' ? 'A'.repeat(GAME_NAME_MAX) : `Spiel ${id}` })) }))

    await local(700)
    expect(page.get('[data-testid="wheel-label-15"]').text()).toBe(`${'A'.repeat(21)}…`)
    expect(page.html()).not.toContain('NaN')
  })

  it('shows another order of the same games, and the Host\'s toggle of the Hidden wheel, at once', async () => {
    page = await mount(restOf(3))
    await change(gamesOf(['s2', 's1', 's0']))
    expect(labelsOf(page)).toEqual(['Spiel s2', 'Spiel s1', 'Spiel s0'])

    await change(hiddenOf(3))
    expect(labelsOf(page)).toEqual(['???', '???', '???'])
    expect(slicesOf(page)).toEqual(slicesOf(await fresh(hiddenOf(3))))
  })
})

describe('out of view', () => {
  it('plays no replay for a change that happened while the wheel was scrolled away', async () => {
    const view = stubInView()
    page = await mount(restOf(3))
    view.see(false)
    await change(restOf(4))
    await local(800)

    view.see(true)
    await flushPromises()
    expect(slicesOf(page)).toEqual(slicesOf(await fresh(restOf(4))))
    expect(opacityOf(page)).toBe('')
  })
})
