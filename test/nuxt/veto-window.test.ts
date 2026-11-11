import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VetoWindow from '~/components/VetoWindow.vue'
import type { BoardTeam } from '~~/shared/event'
import type { SpinView, VetoDrawView, VetoView, WheelView } from '~~/shared/stage'
import { windowMsFor } from '../draw-offsets'

// The Veto window on the stage (#231, 02-components § VetoWindow): the time left from the server's clock, every Party's Vetoes left
// before the end, and at the end the tiles with the Parties that vetoed (never the Player, #355), then what happens to the game.

const STOP = Date.parse('2090-10-30T20:00:10.000Z')
// A game with the default 30 s clip: its window lasts a minute (#505).
const END = STOP + windowMsFor(30)
const iso = (ms: number) => new Date(ms).toISOString()
const halo = { id: 'g1', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
const teams = [{ position: 1, name: null }, { position: 2, name: null }]

const spin = (fields: Partial<SpinView> = {}): SpinView => ({
  roundId: 'r1', drawId: 'd1', spinStartAt: iso(STOP - 6000), stopAt: iso(STOP), slices: 4, resultIndex: 0, resultOffset: 0.5,
  labels: null, game: halo, current: true, ...fields,
})
const windowOf = (fields: Partial<VetoDrawView> = {}): VetoDrawView => ({ drawId: 'd1', kind: 'spin', stopAt: iso(STOP), vetoEndsAt: iso(END), game: halo, ...fields })
/** The wheel with the Veto window of the latest draw (a spin's by default), or none (`null`: the latest draw has no window). */
const wheelOf = (vetoes: Omit<VetoView, 'draw'>, draw: Partial<VetoDrawView> | null = {}): WheelView => ({ count: 3, slices: null, spin: spin(), vetoes: { ...vetoes, draw: draw && windowOf(draw) } })

let serverMs = STOP
/** How often the window looked at the server's clock. */
const serverNow = vi.fn(() => serverMs)
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, teamsProp: readonly BoardTeam[] = teams) {
  page = await mountSuspended(VetoWindow, { props: { wheel, teams: teamsProp, serverNow } })
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  return page
}
const text = () => page!.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = STOP
  serverNow.mockClear()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

describe('the Veto window', () => {
  it('counts the seconds left from the server clock and lists every Party with its Vetoes left, while the window runs', async () => {
    serverMs = STOP + 15_000
    await mount(wheelOf({ left: [2, 1], own: { team: 1, cast: false, rejection: null }, revealed: null }))

    expect(text()).toContain('Veto-Fenster')
    expect(page!.get('[role="timer"]').text()).toBe('Noch 0:45')
    const tiles = page!.findAll('[data-testid="veto-tile"]').map((tile: { text: () => string }) => tile.text().replace(/\s+/g, ' '))
    expect(tiles).toHaveLength(2)
    expect(tiles[0]).toContain('Noch 2 Vetos')
    expect(tiles[1]).toContain('Noch 1 Veto')
    // The hold button is the VetoBar's: the inline window shows the time, the game and the Parties only (F4).
    expect(page!.find('button').exists()).toBe(false)
  })

  it('draws the bar from the Draw\'s own window, not from a 60 s constant: 90 s into a 150 s window it stands at 0.4', async () => {
    serverMs = STOP + 90_000
    await mount(wheelOf({ left: [2, 1], own: null, revealed: null }, { vetoEndsAt: iso(STOP + 150_000) }))

    expect(page!.get('[role="timer"]').text()).toBe('Noch 1:00')
    expect(page!.get('.origin-left.bg-hot').attributes('style')).toContain('scaleX(0.4)')
  })

  // #505: the window lasts the clip plus 30 s, up to 150 s, and the clock counts in m:ss.
  it('shows a window of 150 s as "Noch 2:30" and counts down in m:ss', async () => {
    const long = { vetoEndsAt: iso(STOP + 150_000) }
    const wheel = wheelOf({ left: [2, 1], own: null, revealed: null }, long)
    serverMs = STOP
    await mount(wheel)
    expect(page!.get('[role="timer"]').text()).toBe('Noch 2:30')
    page!.unmount()

    serverMs = STOP + 90_000
    await mount(wheel)
    expect(page!.get('[role="timer"]').text()).toBe('Noch 1:00')
    page!.unmount()

    serverMs = STOP + 91_000
    await mount(wheel)
    expect(page!.get('[role="timer"]').text()).toBe('Noch 0:59')
    page!.unmount()

    serverMs = STOP + 149_000
    await mount(wheel)
    expect(page!.get('[role="timer"]').text()).toBe('Noch 0:01')
  })

  it('turns the clock red from 0:10 on, and not at 0:11', async () => {
    const wheel = wheelOf({ left: [2, 1], own: null, revealed: null })
    serverMs = END - 11_000
    await mount(wheel)
    expect(page!.get('[role="timer"]').text()).toBe('Noch 0:11')
    expect(page!.get('[role="timer"]').classes()).not.toContain('text-error-fg')
    page!.unmount()

    serverMs = END - 10_000
    await mount(wheel)
    expect(page!.get('[role="timer"]').text()).toBe('Noch 0:10')
    expect(page!.get('[role="timer"]').classes()).toContain('text-error-fg')
  })

  it('shows no window to a Member before the stop, when the read carries no end yet (#505)', async () => {
    serverMs = STOP - 3000
    await mount(wheelOf({ left: [2, 1], own: null, revealed: null }, { vetoEndsAt: null, game: null }))

    expect(page!.find('[role="timer"]').exists()).toBe(false)
    expect(page!.find('section').exists()).toBe(false)
  })

  it('reads "Noch 0:01" for the last second (F9)', async () => {
    serverMs = END - 1000
    await mount(wheelOf({ left: [2, 1], own: null, revealed: null }))

    expect(page!.get('[role="timer"]').text()).toBe('Noch 0:01')
  })

  it('names its game with a card, for a spin and for a game the Host set (F6)', async () => {
    serverMs = STOP + 1000
    await mount(wheelOf({ left: [2, 2], own: null, revealed: null }, { kind: 'set', game: { ...halo, name: 'Halo Infinite' } }))

    expect(page!.text()).toContain('Halo Infinite')
    page!.unmount()

    await mount(wheelOf({ left: [2, 2], own: null, revealed: null }, { game: null }))
    expect(page!.text()).not.toContain('Halo')
  })

  it('shows nothing before the wheel has stopped, and nothing for a spin without a window', async () => {
    serverMs = STOP - 1000
    await mount(wheelOf({ left: [2, 2], own: null, revealed: null }))
    expect(page!.find('[data-testid="veto-tile"]').exists()).toBe(false)
    page!.unmount()

    serverMs = STOP + 1000
    await mount(wheelOf({ left: [0, 0], own: null, revealed: null }, null))
    expect(page!.find('[data-testid="veto-tile"]').exists()).toBe(false)
  })

  it('turns the tiles at the end: the Party that vetoed, never a Player, and the game flies off the wheel (#355)', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [1, 2], own: { team: 1, cast: true, rejection: 'veto_window_closed' }, revealed: [{ team: 1 }] }))

    const tiles = page!.findAll('[data-testid="veto-tile"]').map((tile: { text: () => string }) => tile.text().replace(/\s+/g, ' '))
    expect(tiles[0]).toContain('Team Rot')
    expect(tiles[0]).toContain('Veto')
    expect(tiles[0]).not.toContain('von')
    expect(tiles[1]).toContain('Team Orange')
    expect(tiles[1]).toContain('Kein Veto')
    expect(tiles[1]).toContain('Vetos gespart')
    // The cast tile reads „Veto“ twice, the line and the stamp; the tile of the Party that did not veto has no stamp.
    expect(tiles[1]).toMatch(/gespart$/)
    expect(tiles[1]!.match(/Veto/g)).toHaveLength(2)
    expect(text()).toContain('Veto von Team Rot. Halo fliegt vom Rad, es wird neu gedreht.')
  })

  it('lists both Parties that vetoed, by their Team names (#355)', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [1, 1], own: { team: 1, cast: true, rejection: 'veto_window_closed' }, revealed: [{ team: 1 }, { team: 2 }] }))

    expect(text()).toContain('Veto von Team Rot und Team Orange. Halo fliegt vom Rad, es wird neu gedreht.')
  })

  it('names a Party by its Team name, in the tile and in the sentence, also the longest one (#355)', async () => {
    serverMs = END + 100
    const longest = 'Abcdefghijkl Bcdefghijklm Cdefghijklmn'
    await mount(wheelOf({ left: [1, 2], own: null, revealed: [{ team: 1 }] }), [{ position: 1, name: longest }, teams[1]!])

    expect(page!.findAll('[data-testid="veto-tile"]')[0]!.text()).toContain(longest)
    expect(text()).toContain(`Veto von ${longest}. Halo fliegt vom Rad`)
  })

  it('says the game is played when nobody vetoed', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [2, 2], own: { team: 1, cast: false, rejection: 'veto_window_closed' }, revealed: [] }))

    expect(text()).toContain('Kein Veto. Halo wird gespielt. Viel Glück!')
    for (const tile of page!.findAll('[data-testid="veto-tile"]')) expect(tile.text()).toContain('Kein Veto')
  })

  it('says a vetoed game the Host set is chosen anew, not that it flies off the wheel (#232)', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [1, 2], own: { team: 1, cast: true, rejection: 'veto_window_closed' }, revealed: [{ team: 1 }] }, { kind: 'set' }))

    expect(text()).toContain('Veto von Team Rot. Halo fliegt raus, es wird neu gewählt.')
  })

  it('says a set game is played when nobody vetoed it (#232)', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [2, 2], own: { team: 1, cast: false, rejection: 'veto_window_closed' }, revealed: [] }, { kind: 'set' }))

    expect(text()).toContain('Kein Veto. Halo wird gespielt.')
  })

  it('runs from the set instant for a game the Host set, with no spin on the wheel at all (#232)', async () => {
    serverMs = STOP + 20_000
    const wheel: WheelView = { ...wheelOf({ left: [2, 2], own: { team: 1, cast: false, rejection: null }, revealed: null }, { kind: 'set' }), spin: null }
    await mount(wheel)

    expect(page!.get('[role="timer"]').text()).toBe('Noch 0:40')
    // The set game has no card on the wheel, so the window names it (F6).
    expect(page!.text()).toContain('Halo')
  })

  it('reads the clock every frame until the end, then no more (#257)', async () => {
    serverMs = END - 1000
    await mount(wheelOf({ left: [2, 2], own: null, revealed: null }))
    serverNow.mockClear()

    await vi.advanceTimersByTimeAsync(64)
    expect(serverNow).toHaveBeenCalledTimes(4)

    serverMs = END + 100
    await vi.advanceTimersByTimeAsync(16)
    expect(page!.get('[role="timer"]').text()).toBe('Aufdecken …')
    serverNow.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(serverNow).not.toHaveBeenCalled()
  })

  it('waits for the reveal after the end: the numbers stay hidden until the page has read again', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [2, 2], own: null, revealed: null }))

    expect(page!.get('[role="timer"]').text()).toBe('Aufdecken …')
    expect(text()).not.toContain('Kein Veto')
  })
})
