import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { DOMWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LuckyWheel from '~/components/LuckyWheel.vue'
import { GAME_NAME_MAX, type HostGameFacts, type RoundGame } from '~~/shared/game'
import type { SpinView, WheelView } from '~~/shared/stage'
import { kitty, signInAs } from './auth'
import { stubInView } from './in-view'

// The Lucky Wheel (#229, 02-components § LuckyWheel, 04-motion § Lucky Wheel): its rotation toward a fixed stop instant at a given
// server time, the result card that comes at the stop and not before, and the Hidden wheel's label that turns into the real game.
// The server's clock is a variable the tests move; the wheel follows it frame by frame.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const STOP = START + 6000
const iso = (ms: number) => new Date(ms).toISOString()

const halo: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

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
/** How often the wheel looked at the server's clock. */
const serverNow = vi.fn(() => serverMs)
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { hidden?: boolean, isHost?: boolean, hostGames?: Record<string, HostGameFacts> | null } = {}) {
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

const rotation = () => Number(/rotate\((-?[\d.]+)deg\)/.exec(page!.get('[data-testid="wheel-rotor"]').attributes('style') ?? '')?.[1])
const text = () => page!.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers()
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

describe('the wheel at rest', () => {
  it('shows no count line for a Member or a Host, and the accessible name keeps the count (#354)', async () => {
    await mount(wheelOf(null))
    expect(text()).not.toContain('auf dem Rad')
    expect(text()).not.toMatch(/\d+ Spiele?\b/)
    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
    page!.unmount()

    await mount(wheelOf(null), { isHost: true })
    expect(text()).not.toContain('auf dem Rad')
    expect(text()).not.toMatch(/\d+ Spiele?\b/)
    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
  })

  it('shows the games on the wheel as an image of the wheel with its labels', async () => {
    await mount(wheelOf(null))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
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

  it('names one game in the singular, and its slice keeps the first fill rather than the surface colour (#263)', async () => {
    await mount(wheelOf(null, { count: 1, slices: [{ id: 'a', name: 'Halo' }] }))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 1 Spiel')
    expect(text()).not.toContain('1 Spiel auf dem Rad')
    expect(text()).not.toContain('1 Spiele')
    expect(page!.get('[data-testid="wheel-slice"]').attributes('fill')).toBe('#ffd23f')
  })

  it('names two games in the plural, with no count line (#263, #354)', async () => {
    await mount(wheelOf(null, { count: 2, slices: [{ id: 'a', name: 'Halo' }, { id: 'b', name: 'Kart' }] }))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 2 Spielen')
    expect(text()).not.toContain('2 Spiele auf dem Rad')
  })

  it('names zero games in the accessible name, and says the wheel is empty, with no count line (#354)', async () => {
    await mount(wheelOf(null, { count: 0, slices: [] }))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 0 Spielen')
    expect(text()).toContain('Das Rad ist leer')
    expect(text()).not.toContain('auf dem Rad')
  })

  it('keeps the accessible name and no count line for the longest game name (#354)', async () => {
    const name = 'A'.repeat(GAME_NAME_MAX)
    await mount(wheelOf(null, { count: 2, slices: [{ id: 'a', name }, { id: 'b', name: 'Kart' }] }))

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 2 Spielen')
    expect(text()).not.toContain('auf dem Rad')
    expect(page!.get('[data-testid="wheel-label-0"]').text()).toBe(`${'A'.repeat(21)}…`)
  })

  it('gives the last of five slices the surface colour, so it never shares the first slice\'s fill (#263)', async () => {
    const names = ['Halo', 'Kart', 'Schach', 'Pong', 'Tetris']
    await mount(wheelOf(null, { count: 5, slices: names.map((name, index) => ({ id: `s${index}`, name })) }))

    const fills = page!.findAll('[data-testid="wheel-slice"]').map((slice: DOMWrapper<Element>) => slice.attributes('fill'))
    expect(fills).toHaveLength(5)
    expect(fills[4]).toBe('#fff9ef')
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

  it('shows a Member under a Hidden wheel the placeholders instead of the games, and the count in the accessible name only', async () => {
    await mount(wheelOf(null, { slices: null }), { hidden: true })

    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
    expect(text()).not.toContain('auf dem Rad')
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

  it('says the wheel is turning while it runs, and shows no count line after the stop (#354)', async () => {
    await mount(wheelOf(spinOf()))

    await at(START + 3000)
    expect(text()).toContain('Das Rad dreht')
    expect(text()).not.toContain('auf dem Rad')

    // The drawn slice is still on the wheel until stop + 2.2 s, so the name counts the four slices drawn.
    await at(STOP + 100)
    expect(text()).not.toContain('Das Rad dreht')
    expect(text()).not.toContain('auf dem Rad')
    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 4 Spielen')
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

describe('the clock it runs on (#257)', () => {
  // The bulbs blink at rest since #521, so a wheel at rest runs a loop; under reduced motion they are steady and nothing runs (the
  // non-reduced counterpart is in wheel-bulbs.test.ts).
  it('reads the clock only at mount while at rest under reduced motion', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    await mount(wheelOf(null))
    serverNow.mockClear()

    await at(START + 5000)

    expect(serverNow).not.toHaveBeenCalled()
  })

  it('stands at the final angle for a Member who opens the page after the spin has ended, without running a loop under reduced motion', async () => {
    document.documentElement.style.setProperty('--cp-motion', 'reduced')
    serverMs = STOP + 10_000
    await mount(wheelOf(spinOf()))
    serverNow.mockClear()

    await at(STOP + 20_000)

    expect(rotation()).toBeCloseTo(FINAL % 360, 3)
    expect(serverNow).not.toHaveBeenCalled()
  })

  it('stops reading the clock while scrolled out of view mid-spin, and is at the right angle at once on return', async () => {
    const view = stubInView()
    await mount(wheelOf(spinOf()))
    expect(view.observers[0]!.options.rootMargin).toBe('120px')
    await at(START + 1000)

    view.see(false)
    serverNow.mockClear()
    await at(START + 4000)
    expect(serverNow).not.toHaveBeenCalled()

    view.see(true)
    await flushPromises()
    const back = rotation()
    page!.unmount()
    vi.unstubAllGlobals()
    await mount(wheelOf(spinOf()))
    expect(rotation()).toBeCloseTo(back, 3)
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

  it('shows the drawn game on its result card as a tile, cover and name, and no Price line (#435, was #338)', async () => {
    // The clock is pinned so that a Price line would carry „Stand 3. Nov.“: the tile must not show it (the spin itself is in 2090).
    vi.setSystemTime(new Date('2026-11-09T12:00:00.000Z'))
    const priced: RoundGame = { ...halo, price: { cents: 1999, source: 'steam', checkedAt: '2026-11-03T10:00:00.000Z' } }
    await mount(wheelOf(spinOf({ game: priced })))
    await at(STOP)
    expect(text()).toContain('Das Glücksrad sagt')
    expect(page!.get('[data-cover]').attributes('data-cover')).toBe('placeholder')
    expect(text()).toContain('Halo')
    expect(text()).not.toContain('19,99 €')
    expect(text()).not.toContain('Stand')
    page!.unmount()

    await mount(wheelOf(spinOf({ game: halo })))
    await at(STOP)
    expect(text()).toContain('Das Glücksrad sagt')
    expect(text()).not.toContain('Stand')
    expect(text()).not.toContain('€')
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
    expect(page!.get('[role="img"]').attributes('aria-label')).toBe('Glücksrad mit 3 Spielen')
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

  it('keeps the placeholder of the drawn slice when the real name arrives while the wheel is out of view and it comes back at once (#257)', async () => {
    const view = stubInView()
    await mount(wheelOf(spinOf({ labels: placeholders, game: null }), { slices: null }), { hidden: true })
    await at(START + 3000)
    view.see(false)

    await at(STOP + 100)
    await page!.setProps({ wheel: wheelOf(spinOf({ labels: ['Counter-Strudel', 'League of Leberkäse', 'Halo', 'Rocket Lieg'], game: halo }), { slices: null }) })
    view.see(true)
    await flushPromises()
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

// The game dialog from the drawn game's tile (#443, #444): the Host's has the Tags and Notes from `hostGames`; a Member's has the facts and never those.
describe('the drawn game\'s tile and its dialog (#443, #444)', () => {
  const hostGames = { 'g-halo': { tags: [{ key: 'koop', label: 'Koop' }, { key: 'retro', label: 'Retro' }], notes: 'Hausregel: keine Raketen' } }
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null

  beforeEach(() => {
    document.body.innerHTML = ''
    // The link to the library entry is for a Host who may see the library.
    signInAs({ ...kitty, canHost: true })
  })

  it('opens the dialog of „Zuletzt gezogen“ for the Host with the game\'s Tags and Notes', async () => {
    await mount(wheelOf(spinOf({ game: halo })), { isHost: true, hostGames })
    await at(STOP + 100)

    const tile = page!.get('button[aria-haspopup="dialog"]')
    expect(tile.text()).toBe('Halo')
    await tile.trigger('click')
    await flushPromises()

    expect(dialog()!.querySelector('h2')?.textContent).toBe('Halo')
    expect(dialog()!.textContent).toContain('Koop')
    expect(dialog()!.textContent).toContain('Retro')
    expect(dialog()!.textContent).toContain('Hausregel: keine Raketen')
    expect(dialog()!.querySelector('a')?.getAttribute('href')).toBe('/bibliothek/g-halo')
  })

  it('opens the dialog of a game whose facts are missing, without Tags and Notes', async () => {
    await mount(wheelOf(spinOf({ game: halo })), { isHost: true })
    await at(STOP + 100)

    await page!.get('button[aria-haspopup="dialog"]').trigger('click')
    await flushPromises()

    expect(dialog()!.querySelector('h2')?.textContent).toBe('Halo')
    expect(dialog()!.textContent).not.toContain('Notizen')
  })

  it('opens a Member\'s „Zuletzt gezogen“ tile as a dialog with the facts and without Tags and Notes, though hostGames were handed in (#444)', async () => {
    const drawn: RoundGame = { ...halo, suitabilities: ['teams'], price: { cents: 1999, source: 'steam', checkedAt: '2026-11-03T10:00:00.000Z' } }
    await mount(wheelOf(spinOf({ game: drawn })), { hostGames })
    await at(STOP + 100)

    const tile = page!.get('button[aria-haspopup="dialog"]')
    expect(tile.text()).toBe('Halo')
    expect(dialog()).toBeNull()
    await tile.trigger('click')
    await flushPromises()

    expect(dialog()!.querySelector('h2')?.textContent).toBe('Halo')
    expect(dialog()!.textContent).toContain('bis 4')
    expect(dialog()!.textContent).not.toContain('2 bis')
    expect(dialog()!.textContent).toContain('Teams')
    expect(dialog()!.textContent).toContain('Stand')
    for (const hidden of ['Koop', 'Retro', 'Hausregel: keine Raketen', 'Notizen']) expect(dialog()!.textContent).not.toContain(hidden)
    expect(dialog()!.querySelector('a')).toBeNull()
    expect(dialog()!.querySelector('footer')).toBeNull()
  })
})
