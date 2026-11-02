import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { DOMWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StageWheel from '~/components/StageWheel.vue'
import type { EventSettings } from '~~/shared/settings'
import type { EventView } from '~~/shared/event'
import type { SpinView, WheelView } from '~~/shared/stage'
import { VETO_WINDOW_MS } from '~~/shared/rounds'
import { memberView, SANNE, view } from './event-page'

// The wheel block of the Event page (#257, B4): the Lucky Wheel, and the Veto window while a draw has one. Both read the same
// wheel data and the page's server clock; the wheel's own edges stay in lucky-wheel.test.ts, the window's in veto-window.test.ts.

const STOP = Date.parse('2090-10-30T20:00:10.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const halo = { id: 'g1', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }
const teams = [{ position: 1, name: null, frozen: false }, { position: 2, name: null, frozen: false }]
const members = [
  memberView({ id: SANNE, name: 'Sanne', isHost: true, zone: 'team', team: 1 }),
  memberView({ id: 'mate', name: 'Zwei', zone: 'team', team: 2 }),
]

const spin: SpinView = {
  roundId: 'r1', drawId: 'd1', spinStartAt: iso(STOP - 6000), stopAt: iso(STOP), slices: 3, resultIndex: 0, resultOffset: 0.5,
  labels: null, game: halo, current: true,
}
/** A wheel with three games on it, and the Veto window of the latest draw (its spin) when `draw` is true. */
function wheelOf(draw: boolean): WheelView {
  return {
    count: 3,
    slices: [{ id: 'g1', name: 'Halo' }, { id: 'g2', name: 'Kart' }, { id: 'g3', name: 'Schach' }],
    spin: draw ? spin : null,
    vetoes: {
      left: [2, 2], own: null, revealed: null,
      draw: draw ? { drawId: 'd1', kind: 'spin', stopAt: iso(STOP), vetoEndsAt: iso(STOP + VETO_WINDOW_MS), game: halo } : null,
    },
  }
}

/** The page's view with a wheel, as the Event read sends it while a Lucky Wheel Event runs. */
function viewOf(wheel: WheelView, settings: Partial<EventSettings> = {}) {
  return view('stage-wheel', [], { wheel, members, teams, settings: { hiddenWheel: false, ...settings } as EventSettings }) as unknown as EventView
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(props: EventView) {
  page = await mountSuspended(StageWheel, { props: { view: props, serverNow: () => STOP } })
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  return page
}
const text = () => page!.text().replace(/\s+/g, ' ')
const headings = () => page!.findAll('h2').map((heading: DOMWrapper<Element>) => heading.text())

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(STOP)
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

describe('StageWheel', () => {
  it('renders the Glücksrad and no Veto window while no draw has one', async () => {
    await mount(viewOf(wheelOf(false)))

    expect(headings()).toEqual(['Glücksrad'])
    expect(text()).not.toContain('Veto-Fenster')
  })

  it('renders the Glücksrad and the Veto window while a draw has one', async () => {
    await mount(viewOf(wheelOf(true)))

    expect(headings()).toEqual(['Glücksrad', 'Veto-Fenster'])
  })

  it('shows the games on the wheel when the wheel is not hidden', async () => {
    await mount(viewOf(wheelOf(false)))

    expect(text()).toContain('Halo')
    expect(text()).not.toContain('???')
  })

  it('shows a Member the count and ??? under a Hidden wheel, where the server sends no games', async () => {
    await mount(viewOf({ ...wheelOf(false), slices: null }, { hiddenWheel: true }))

    expect(text()).toContain('3 Spiele auf dem Rad')
    expect(text()).not.toContain('Halo')
    expect(text().match(/\?\?\?/g)).toHaveLength(3)
  })
})
