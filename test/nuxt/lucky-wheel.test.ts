import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { DOMWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import type { RoundGame } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'

// The Lucky Wheel (#229, 02-components § LuckyWheel, 04-motion § Lucky Wheel): its rotation toward a fixed stop instant at a given
// server time, the result card that comes at the stop and not before, and the Hidden wheel's label that turns into the real game.
// The server's clock is a variable the tests move; the wheel follows it frame by frame.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const iso = (ms: number) => new Date(ms).toISOString()

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }

/** A spin of four slices that lands in the third (Pong) at a quarter of it: the final angle is -(2 + .25) * 90 - 1800. */
const FINAL = -2002.5
function spinOf(fields: Partial<SpinView> = {}): SpinView {
  return {
    roundId: 'r1', drawId: 'd1', spinStartAt: iso(START), stopAt: iso(STOP), slices: 4, resultIndex: 2, resultOffset: 0.25,
    labels: ['Halo', 'Kart', 'Pong', 'Schach'], game: null, current: true, ...fields,
  }
}
const wheelOf = (spin: SpinView | null, fields: Partial<WheelView> = {}): WheelView => ({
  count: 3, slices: [{ id: 'a', name: 'Halo' }, { id: 'b', name: 'Kart' }, { id: 'c', name: 'Schach' }], spin, vetoes: { left: [], own: null, revealed: null, draw: null }, ...fields,
})

let serverMs = START - 1000
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean } = {}) {
  page = await mountSuspended(LuckyWheel, { props: { wheel, hidden: false, isHost: false, serverNow: () => serverMs, ...props } })
  await flushPromises()
  return page
}

/** Moves the server's clock and lets the frame that follows it run. */
async function at(ms: number) {
  serverMs = ms
  vi.advanceTimersByTime(50)
  await flushPromises()
}

const rotation = () => Number(/rotate\((-?[\d.]+)deg\)/.exec(page!.get('[data-testid="wheel-rotor"]').attributes('style') ?? '')?.[1])
const text = () => page!.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = START - 1000
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

describe('the wheel at rest', () => {
  it('shows the games on the wheel, counted, as an image of the wheel with its labels', async () => {
    await mount(wheelOf(null))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
    expect(text()).toContain('3 Spiele auf dem Rad')
    for (const name of ['Halo', 'Kart', 'Schach']) expect(text()).toContain(name)
    expect(text()).not.toContain('Das Glücksrad sagt')
  })

  it('shrinks a long label to fit between the rim and the hub, and keeps a short one at full size (#263)', async () => {
    await mount(wheelOf(null, { count: 2, slices: [{ id: 'a', name: 'Counter-Strike 2' }, { id: 'b', name: 'Kart' }] }))

    const long = page!.get('[data-testid="wheel-label-0"]')
    expect(Number(long.attributes('font-size'))).toBeLessThan(19)
    expect(Number(long.attributes('font-size')) * 16 * 0.66).toBeLessThanOrEqual(142)
    expect(Number(page!.get('[data-testid="wheel-label-1"]').attributes('font-size'))).toBe(19)
  })

  it('cuts a 25-character label to 22 characters and sets it at the smallest size (#263)', async () => {
    await mount(wheelOf(null, { count: 2, slices: [{ id: 'a', name: 'Abcdefghijklmnopqrstuvwxy' }, { id: 'b', name: 'Kart' }] }))

    const label = page!.get('[data-testid="wheel-label-0"]')
    expect(label.text()).toBe('Abcdefghijklmnopqrstu…')
    expect(label.attributes('font-size')).toBe('9')
  })

  it('counts one game in the singular, and its slice keeps the first fill rather than the surface colour (#263)', async () => {
    await mount(wheelOf(null, { count: 1, slices: [{ id: 'a', name: 'Halo' }] }))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 1 Spiel')
    expect(text()).toContain('1 Spiel auf dem Rad')
    expect(text()).not.toContain('1 Spiele')
    expect(page!.get('[data-testid="wheel-slice"]').attributes('fill')).toBe('var(--cp-primary)')
  })

  it('counts two games in the plural (#263)', async () => {
    await mount(wheelOf(null, { count: 2, slices: [{ id: 'a', name: 'Halo' }, { id: 'b', name: 'Kart' }] }))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 2 Spielen')
    expect(text()).toContain('2 Spiele auf dem Rad')
  })

  it('gives the last of five slices the surface colour, so it never shares the first slice\'s fill (#263)', async () => {
    const names = ['Halo', 'Kart', 'Schach', 'Pong', 'Tetris']
    await mount(wheelOf(null, { count: 5, slices: names.map((name, index) => ({ id: `s${index}`, name })) }))

    const fills = page!.findAll('[data-testid="wheel-slice"]').map((slice: DOMWrapper<Element>) => slice.attributes('fill'))
    expect(fills).toHaveLength(5)
    expect(fills[4]).toBe('var(--cp-surface-2)')
  })

  it('cuts a long name at 22 characters as the User sees them, so an emoji is never torn in two (F19)', async () => {
    const name = '🎮'.repeat(25)
    await mount(wheelOf(null, { slices: [{ id: 'a', name }, { id: 'b', name: 'Kart' }, { id: 'c', name: 'Schach' }] }))

    expect(page!.get('[data-testid="wheel-label-0"]').text()).toBe(`${'🎮'.repeat(21)}…`)
    expect(page!.get('[data-testid="wheel-label-1"]').text()).toBe('Kart')
  })

  it('says so when the wheel is empty', async () => {
    await mount(wheelOf(null, { count: 0, slices: [] }))

    expect(text()).toContain('Das Rad ist leer')
  })

  it('shows a Member under a Hidden wheel the count and ??? instead of the games', async () => {
    await mount(wheelOf(null, { slices: null }), { hidden: true })

    expect(text()).toContain('3 Spiele auf dem Rad')
    expect(text()).not.toContain('Halo')
    expect(text().match(/\?\?\?/g)).toHaveLength(3)
  })
})

describe('the spin toward its stop', () => {
  it('stands at 0 until the spin starts, for every device alike', async () => {
    await mount(wheelOf(spinOf(), { count: 3 }))

    await at(START - 500)
    expect(rotation()).toBe(0)
    expect(text()).toContain('Das Rad dreht')
  })

  it('turns toward the stop, further the later the server time is, and lands on the final angle at the stop', async () => {
    await mount(wheelOf(spinOf()))

    await at(START + 1500)
    const early = rotation()
    await at(START + 3000)
    const middle = rotation()
    expect(early).toBeLessThan(0)
    expect(middle).toBeLessThan(early)

    await at(STOP)
    expect(rotation()).toBeCloseTo(FINAL, 3)
    await at(STOP + 1000)
    expect(rotation()).toBeCloseTo(FINAL, 3)
  })

  it('is at the same angle for a Member who opens the page in the middle of the spin as for one who watched', async () => {
    await mount(wheelOf(spinOf()))
    await at(START + 2345)
    const watched = rotation()
    page!.unmount()

    serverMs = START + 2345
    await mount(wheelOf(spinOf()))

    expect(rotation()).toBeCloseTo(watched, 3)
  })
})

describe('the result', () => {
  it('shows no result card before the stop, and the card with the game at the stop', async () => {
    await mount(wheelOf(spinOf({ game: null })))
    await at(STOP - 100)
    expect(text()).not.toContain('Das Glücksrad sagt')

    page!.unmount()
    await mount(wheelOf(spinOf({ game: halo })))
    await at(STOP - 100)
    expect(text()).not.toContain('Das Glücksrad sagt')
    expect(page!.find('[role="status"]').text()).toBe('')

    await at(STOP)
    expect(text()).toContain('Das Glücksrad sagt')
    expect(text()).toContain('Halo')
    expect(page!.get('[role="status"]').text()).toBe('Glücksrad: Halo')
  })

  it('names no game once the spin is no longer the latest draw: a vetoed, replaced or put-back game (F6)', async () => {
    await mount(wheelOf(spinOf({ game: halo, current: false })))
    await at(STOP + 100)

    expect(text()).not.toContain('Das Glücksrad sagt')
    expect(text()).not.toContain('Zuletzt gezogen')
    expect(page!.get('[role="status"]').text()).toBe('')
  })

  it('lets the drawn slice leave 2.2 s after the stop and the others close the gap', async () => {
    await mount(wheelOf(spinOf({ game: halo })))
    await at(STOP + 100)
    expect(page!.findAll('[data-testid="wheel-slice"]')).toHaveLength(4)
    expect(text()).toContain('Pong')

    await at(STOP + 2200 + 600)
    // The Event read has taken the drawn game off the wheel by now: the idle wheel holds the three that are left.
    expect(text()).not.toContain('Pong')
    expect(page!.findAll('[data-testid="wheel-slice"]')).toHaveLength(3)
  })
})

describe('a Hidden wheel', () => {
  const placeholders = ['Counter-Strudel', 'League of Leberkäse', 'Mario Kartoffel', 'Rocket Lieg']

  it('shows a Member the placeholders of the spin, and the drawn label turns into the real game half a second after the stop', async () => {
    await mount(wheelOf(spinOf({ labels: placeholders, game: null }), { slices: null }), { hidden: true })
    await at(START + 3000)
    for (const label of placeholders) expect(text()).toContain(label)
    expect(text()).not.toContain('Halo')

    // The refetch at the stop brings the game and the label of the result slice with the real name (the server swaps it in).
    page!.unmount()
    serverMs = STOP + 100
    await mount(wheelOf(spinOf({ labels: ['Counter-Strudel', 'League of Leberkäse', 'Halo', 'Rocket Lieg'], game: halo }), { slices: null }), { hidden: true })
    await at(STOP + 100)
    expect(text()).toContain('Das Glücksrad sagt')
    expect(text()).not.toContain('Mario Kartoffel')
    expect(page!.get('[data-testid="wheel-label-2"]').text()).not.toBe('Halo')

    await at(STOP + 500 + 400)
    expect(page!.get('[data-testid="wheel-label-2"]').text()).toBe('Halo')
  })

  it('shows the Host the real names on the slices from the start', async () => {
    await mount(wheelOf(spinOf({ game: halo }), { slices: [{ id: 'a', name: 'Kart' }] }), { hidden: true, isHost: true })
    await at(START + 3000)

    for (const name of ['Halo', 'Kart', 'Pong', 'Schach']) expect(text()).toContain(name)
  })
})
