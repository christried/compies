import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VetoWindow from '~/components/VetoWindow.vue'
import type { MemberView, SpinView, VetoView, WheelView } from '~~/shared/event'
import { VETO_WINDOW_MS } from '~~/shared/rounds'

// The Veto window on the stage (#231, 02-components § VetoWindow): the time left from the server's clock, every Party's Vetoes left
// before the end, and at the end the tiles with who vetoed, then what happens to the game.

const STOP = Date.parse('2090-10-30T20:00:10.000Z')
const END = STOP + VETO_WINDOW_MS
const iso = (ms: number) => new Date(ms).toISOString()
const halo = { id: 'g1', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }
const teams = [{ position: 1, name: null, frozen: false }, { position: 2, name: null, frozen: false }]
const member = (id: string, name: string, team: number): MemberView => ({ id, name, image: null, isHost: false, zone: 'team', team, teamWord: null })
const members = [member('me', 'Eins', 1), member('mate', 'Zwei', 1), member('other', 'Drei', 2)]

const spin = (fields: Partial<SpinView> = {}): SpinView => ({
  roundId: 'r1', drawId: 'd1', spinStartAt: iso(STOP - 6000), stopAt: iso(STOP), slices: 4, resultIndex: 0, resultOffset: 0.5,
  labels: null, game: halo, vetoEndsAt: iso(END), ...fields,
})
const wheelOf = (vetoes: VetoView, fields: Partial<SpinView> = {}): WheelView => ({ count: 3, slices: null, spin: spin(fields), vetoes })

let serverMs = STOP
let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(wheel: WheelView, props: { cast?: () => Promise<boolean> } = {}) {
  page = await mountSuspended(VetoWindow, { props: { wheel, teams, members, viewerId: 'me', serverNow: () => serverMs, cast: () => Promise.resolve(true), ...props } })
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  return page
}
const text = () => page!.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers()
  serverMs = STOP
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

describe('the Veto window', () => {
  it('counts the seconds left from the server clock and lists every Party with its Vetoes left, while the window runs', async () => {
    serverMs = STOP + 15_000
    await mount(wheelOf({ left: [2, 1], own: { team: 1, castBy: null, rejection: null }, revealed: null }))

    expect(text()).toContain('Veto-Fenster')
    expect(page!.get('[role="timer"]').text()).toBe('Noch 45 Sekunden')
    const tiles = page!.findAll('[data-testid="veto-tile"]').map((tile: { text: () => string }) => tile.text().replace(/\s+/g, ' '))
    expect(tiles).toHaveLength(2)
    expect(tiles[0]).toContain('Noch 2 Vetos')
    expect(tiles[1]).toContain('Noch 1 Veto')
    expect(page!.find('[data-testid="veto-hold"]').exists()).toBe(true)
  })

  it('shows nothing before the wheel has stopped, and nothing for a spin without a window', async () => {
    serverMs = STOP - 1000
    await mount(wheelOf({ left: [2, 2], own: null, revealed: null }))
    expect(page!.find('[data-testid="veto-tile"]').exists()).toBe(false)
    page!.unmount()

    serverMs = STOP + 1000
    await mount(wheelOf({ left: [0, 0], own: null, revealed: null }, { vetoEndsAt: null }))
    expect(page!.find('[data-testid="veto-tile"]').exists()).toBe(false)
  })

  it('turns the tiles at the end: who vetoed on which Party, and the game flies off the wheel', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [1, 2], own: { team: 1, castBy: 'mate', rejection: 'veto_window_closed' }, revealed: [{ team: 1, userId: 'mate' }] }))

    const tiles = page!.findAll('[data-testid="veto-tile"]').map((tile: { text: () => string }) => tile.text().replace(/\s+/g, ' '))
    expect(tiles[0]).toContain('Veto')
    expect(tiles[0]).toContain('von Zwei')
    expect(tiles[1]).toContain('Kein Veto')
    expect(text()).toContain('Veto von Zwei. Halo fliegt vom Rad, es wird neu gedreht.')
    expect(page!.find('[data-testid="veto-hold"]').exists()).toBe(false)
  })

  it('says the game is played when nobody vetoed', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [2, 2], own: { team: 1, castBy: null, rejection: 'veto_window_closed' }, revealed: [] }))

    expect(text()).toContain('Kein Veto. Halo wird gespielt.')
  })

  it('waits for the reveal after the end: the numbers stay hidden until the page has read again', async () => {
    serverMs = END + 100
    await mount(wheelOf({ left: [2, 2], own: null, revealed: null }))

    expect(page!.get('[role="timer"]').text()).toBe('Aufdecken …')
    expect(text()).not.toContain('Kein Veto')
  })
})
