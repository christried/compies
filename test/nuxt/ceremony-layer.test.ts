import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CeremonyLayer from '~/components/CeremonyLayer.vue'
import { CEREMONY_LEAD_MS, ceremonyTimeline } from '~~/shared/ceremony'
import type { BoardTeam, MemberView } from '~~/shared/event'
import type { CeremonyView } from '~~/shared/stage'
import { dialog, memberView } from './event-page'

// The Award ceremony's layer (#309, spec #308): it opens at the start instant for whoever has the Event open, shows the end frame, and
// closes for the viewer and that start. The server clock is a fake here: the test moves it, as coin-flip.test.ts does.

const T0 = Date.parse('2090-10-30T20:00:00.000Z')
const STARTS = T0 + CEREMONY_LEAD_MS
const RUN = ceremonyTimeline(2, 'trip').endMs
const ENDS = STARTS + RUN

type Layer = InstanceType<typeof CeremonyLayer>['$props']['view']

const ceremonyAt = (startsAt: number, parties = 2): CeremonyView => ({
  startsAt: new Date(startsAt).toISOString(),
  endsAt: new Date(startsAt + ceremonyTimeline(parties, 'trip').endMs).toISOString(),
  gag: 'trip',
})
const team = (position: number, name: string | null = null): BoardTeam => ({ position, name, frozen: true })
const player = (id: string, name: string, teamPosition: number): MemberView => memberView({ id, name, zone: 'team', team: teamPosition })
const people = (count: number, teamPosition: number): MemberView[] => Array.from({ length: count }, (_, index) => player(`p${teamPosition}-${index}`, `Leute ${teamPosition}-${index + 1}`, teamPosition))

/** A finished Event's read of two Parties: Wilde Gurken won with 9, Nacht Eulen have 3. */
const finished = (overrides: Partial<Layer> = {}): Layer => ({
  ceremony: ceremonyAt(STARTS),
  standings: [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 3 }],
  members: [player('a', 'Anna', 1), player('b', 'Bert', 1), player('c', 'Cleo', 2)],
  teams: [team(1, 'Wilde Gurken'), team(2, 'Nacht Eulen')],
  ...overrides,
})

let serverTime = T0
const serverNow = vi.fn(() => serverTime)
let mounted: Awaited<ReturnType<typeof mountSuspended>> | undefined

/** The page around the layer: its heading (the focus's fallback), a button to have focus on, and the layer. */
const Page = defineComponent({
  props: { view: { type: Object as PropType<Layer>, required: true } },
  setup: props => () => h('div', [
    h('main', { id: 'stage' }, [h('h1', { 'tabindex': -1, 'data-testid': 'heading' }, 'Freitags-Zocken'), h('button', { id: 'page-button', type: 'button' }, 'Seite')]),
    h(CeremonyLayer, { view: props.view, serverNow }),
  ]),
})

async function mount(view: Layer, at = T0) {
  serverTime = at
  mounted = await mountSuspended(Page, { props: { view }, attachTo: document.body })
  await settle()
  return mounted
}

/** Lets the ticker's frame, the watchers and the dialog's focus run. */
async function settle() {
  vi.advanceTimersByTime(20)
  await nextTick()
  await flushPromises()
  await nextTick()
}

/** Moves the server's clock to `at` (epoch ms). */
async function passTo(at: number) {
  serverTime = at
  await settle()
}

async function refetch(view: Layer) {
  await mounted!.setProps({ view })
  await settle()
}

const closeButton = () => dialog()?.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')
const pageButton = () => document.querySelector<HTMLButtonElement>('#page-button')!
const text = () => dialog()?.textContent ?? ''
const cells = () => [...(dialog()?.querySelectorAll('ul[aria-label="Die Leute der Sieger"] > li') ?? [])]
const rows = () => [...(dialog()?.querySelectorAll('ol[aria-label="Endstand"] > li') ?? [])].map(row => [...row.children].map(part => part.textContent?.trim()).join(' '))

async function pressEscape(target: EventTarget) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await settle()
}

beforeEach(() => {
  serverTime = T0
  serverNow.mockClear()
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(T0))
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('when the layer opens', () => {
  it('opens at the start instant as a dialog named „Siegerehrung!“', async () => {
    await mount(finished(), STARTS)

    expect(dialog()).not.toBeNull()
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
    const heading = document.getElementById(dialog()!.getAttribute('aria-labelledby')!)
    expect(heading?.textContent?.trim()).toBe('Siegerehrung!')
  })

  it('does not open before the start instant, and opens at it', async () => {
    await mount(finished(), STARTS - 1000)
    expect(dialog()).toBeNull()

    await passTo(STARTS - 1)
    expect(dialog()).toBeNull()

    await passTo(STARTS)
    expect(dialog()).not.toBeNull()
  })

  it('opens for a Member who comes in mid-run, and during the lead it waits', async () => {
    await mount(finished(), STARTS + 2000)
    expect(dialog()).not.toBeNull()
    mounted!.unmount()

    await mount(finished(), STARTS - CEREMONY_LEAD_MS)
    expect(dialog()).toBeNull()
  })

  it('does not open for a page first mounted at the end of the run or later', async () => {
    await mount(finished(), ENDS)
    expect(dialog()).toBeNull()
    mounted!.unmount()

    await mount(finished(), ENDS + 60_000)
    expect(dialog()).toBeNull()
  })

  it('stays open when the clock passes the end of the run: the end frame waits to be closed', async () => {
    await mount(finished(), STARTS)

    await passTo(ENDS - 1)
    expect(dialog()).not.toBeNull()
    await passTo(ENDS + 5000)
    expect(dialog()).not.toBeNull()
  })

  it('has no layer without a ceremony', async () => {
    await mount(finished({ ceremony: null }), STARTS)

    expect(dialog()).toBeNull()
  })
})

describe('closing it', () => {
  it('closes with the close button', async () => {
    await mount(finished(), STARTS)

    closeButton()!.click()
    await settle()

    expect(dialog()).toBeNull()
  })

  it('stays closed across a refetch of the same start', async () => {
    await mount(finished(), STARTS)
    closeButton()!.click()
    await settle()

    await refetch(finished())
    await passTo(STARTS + 500)

    expect(dialog()).toBeNull()
  })

  it('opens again for a new start, at its own instant', async () => {
    await mount(finished(), STARTS)
    closeButton()!.click()
    await settle()
    const later = STARTS + RUN + 10_000

    await passTo(later - CEREMONY_LEAD_MS)
    await refetch(finished({ ceremony: ceremonyAt(later) }))
    expect(dialog()).toBeNull()

    await passTo(later)
    expect(dialog()).not.toBeNull()
  })

  it('goes and comes back when a new start arrives while the old end frame is open', async () => {
    await mount(finished(), STARTS)
    await passTo(STARTS + RUN + 1000)
    expect(dialog()).not.toBeNull()
    const later = STARTS + RUN + 10_000

    await passTo(later - CEREMONY_LEAD_MS)
    await refetch(finished({ ceremony: ceremonyAt(later) }))
    expect(dialog()).toBeNull()

    await passTo(later)
    expect(dialog()).not.toBeNull()
  })

  it('forgets a close on a reload: the run is still on, so the layer opens again', async () => {
    await mount(finished(), STARTS + 1000)
    closeButton()!.click()
    await settle()
    mounted!.unmount()

    await mount(finished(), STARTS + 2000)

    expect(dialog()).not.toBeNull()
  })

  it('closes with Escape while focus is inside', async () => {
    await mount(finished(), STARTS)
    expect(dialog()!.contains(document.activeElement)).toBe(true)

    await pressEscape(document.activeElement!)

    expect(dialog()).toBeNull()
  })

  it('closes with Escape while focus is on the page, since the side panel stays clickable', async () => {
    await mount(finished(), STARTS)
    pageButton().focus()

    await pressEscape(pageButton())

    expect(dialog()).toBeNull()
  })
})

describe('the live region', () => {
  const status = () => dialog()?.querySelector('[role="status"]')?.textContent?.trim()

  it('names the Winner in a polite live region inside the dialog', async () => {
    await mount(finished(), STARTS)

    expect(dialog()!.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite')
    expect(status()).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
  })

  it('names every Winner of a Tie', async () => {
    await mount(finished({ standings: [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 1, points: 9 }] }), STARTS)

    expect(status()).toBe('Unentschieden: Wilde Gurken und Nacht Eulen, je 9 Punkte.')
  })
})

describe('focus', () => {
  it('moves from a page button to the close button on opening, and back on closing', async () => {
    await mount(finished(), STARTS - 1000)
    pageButton().focus()

    await passTo(STARTS)
    expect(document.activeElement).toBe(closeButton())

    closeButton()!.click()
    await settle()
    expect(document.activeElement).toBe(pageButton())
  })

  it('returns to the page heading when nothing had focus', async () => {
    await mount(finished(), STARTS - 1000)
    expect(document.activeElement).toBe(document.body)

    await passTo(STARTS)
    closeButton()!.click()
    await settle()

    expect(document.activeElement).toBe(document.querySelector('#stage h1'))
  })
})

describe('what the end frame shows', () => {
  it('lists the places from second to last as real text with points', async () => {
    const eight = Array.from({ length: 8 }, (_, index) => ({ team: index + 1, rank: index + 1, points: 8 - index }))
    await mount(finished({ ceremony: ceremonyAt(STARTS, 8), standings: eight, teams: [], members: [] }), STARTS)

    expect(rows()).toHaveLength(7)
    expect(rows()[0]).toBe('2 Team Orange 7 P.')
    expect(rows()[6]).toBe('8 Team Nacht 1 P.')
  })

  it('shows 1 row for 2 Parties, with the rank and the points', async () => {
    await mount(finished(), STARTS)

    expect(rows()).toEqual(['2 Nacht Eulen 3 P.'])
  })

  it('prints equal points on a shared rank: 2, 2, 4', async () => {
    await mount(finished({
      ceremony: ceremonyAt(STARTS, 4),
      standings: [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 2, points: 5 }, { team: 3, rank: 2, points: 5 }, { team: 4, rank: 4, points: 1 }],
      teams: [team(1, 'A'), team(2, 'B'), team(3, 'C'), team(4, 'D')],
    }), STARTS)

    expect(rows().map(row => row?.split(' ')[0])).toEqual(['2', '2', '4'])
  })

  it('shows „Platz 1“, the Team name, the points and the stamp „SIEGER“', async () => {
    await mount(finished(), STARTS)

    expect(text()).toContain('Platz 1')
    expect(text()).toContain('Wilde Gurken')
    expect(text()).toContain('9 P.')
    expect(text()).toContain('SIEGER')
  })

  it('lists one item per Winner of a Tie, every Team name as plain text, without a team colour in the header', async () => {
    await mount(finished({ standings: [{ team: 1, rank: 1, points: 9 }, { team: 2, rank: 1, points: 9 }] }), STARTS)

    const winners = [...dialog()!.querySelectorAll('[data-testid="winners"] li')].map(item => item.textContent?.trim())
    expect(winners).toEqual(['Wilde Gurken', 'Nacht Eulen'])
    expect(rows()).toEqual([])
    expect(text()).toContain('SIEGER')
    // The people of both Winners stand in one list.
    expect(cells().map(cell => cell.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Anna'), expect.stringContaining('Cleo')]))
  })

  it('shows the Players of the Winner with a picture and a name, never the other Party', async () => {
    await mount(finished(), STARTS)

    expect(cells().map(cell => cell.textContent?.trim())).toEqual(['Anna', 'Bert'])
    expect(cells().every(cell => cell.querySelector('img') !== null)).toBe(true)
  })

  it('shows 6 Players without a „+N“', async () => {
    await mount(finished({ members: people(6, 1) }), STARTS)

    expect(cells()).toHaveLength(6)
    expect(text()).not.toContain('weitere')
  })

  it('shows 5 avatars and „+2“ with „2 weitere“ for 7 Players, and „+7“ for 12', async () => {
    await mount(finished({ members: people(7, 1) }), STARTS)
    expect(cells()).toHaveLength(6)
    expect(cells()[5]!.textContent).toContain('+2')
    expect(cells()[5]!.textContent).toContain('2 weitere')
    mounted!.unmount()

    await mount(finished({ members: people(12, 1) }), STARTS)
    expect(cells()).toHaveLength(6)
    expect(cells()[5]!.textContent).toContain('+7')
  })

  it('shows the TeamMark and the Team name of a Winner without Players', async () => {
    await mount(finished({ members: [player('c', 'Cleo', 2)] }), STARTS)

    expect(cells()).toHaveLength(1)
    expect(cells()[0]!.textContent?.trim()).toBe('Wilde Gurken')
    expect(cells()[0]!.querySelector('img')).toBeNull()
    expect(cells()[0]!.querySelector('svg')).not.toBeNull()
  })

  it('names the longest Team name in full in the DOM', async () => {
    const longest = Array.from({ length: 6 }, () => 'W'.repeat(12)).join(' ')
    await mount(finished({ teams: [team(1, longest), team(2, longest)] }), STARTS)

    expect(text()).toContain(longest)
  })

  it('shows Compibert in his still pose, hidden from assistive technology', async () => {
    await mount(finished(), STARTS)

    const compibert = dialog()!.querySelector('.compibert')
    expect(compibert).not.toBeNull()
    expect(compibert!.getAttribute('aria-hidden')).toBe('true')
  })
})
