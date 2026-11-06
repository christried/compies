import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, type PropType } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import CeremonyLayer from '~/components/CeremonyLayer.vue'
import ShareDialog from '~/components/ShareDialog.vue'
import { loadGsap } from '~/utils/gsap'
import { CEREMONY_GAGS, CEREMONY_LEAD_MS, ceremonyTimeline, type CeremonyGag } from '~~/shared/ceremony'
import type { BoardTeam, EventView, MemberView } from '~~/shared/event'
import type { CeremonyView } from '~~/shared/stage'
import { dialog, memberView, restoreScreen, stubScreen } from './event-page'
import { motion } from './motion'

// The Award ceremony's layer (#309, #312, spec #308): it opens at the start instant for whoever has the Event open, plays the Pokal-Lauf
// from the server's clock to the end frame, and closes for the viewer and that start. The server clock is a fake here: the test moves it, as
// coin-flip.test.ts does. Real GSAP moves the real parts (happy-dom has no layout, so no positions are asserted, and no easing or duration
// either: ADR 0015 deviates from CODING_STANDARDS § Motion); the rig is a stub that shows the pose the layer asks for (#311 tests the rig).

// A test can make the GSAP chunk fail to load.
const chunk = vi.hoisted(() => ({ fail: false, loads: 0 }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return async () => {
    chunk.loads++
    if (chunk.fail) throw new Error('chunk failed')
    return real()
  }
})

/** The rig as the layer sees it: the pose it was asked for. */
const RigStub = defineComponent({
  props: { state: { type: String, default: 'idle' } },
  setup: props => () => h('span', { 'data-testid': 'rig', 'data-state': props.state }),
})

const T0 = Date.parse('2090-10-30T20:00:00.000Z')
const STARTS = T0 + CEREMONY_LEAD_MS
const RUN = ceremonyTimeline(2, 'trip', 1).endMs
const ENDS = STARTS + RUN

type Layer = InstanceType<typeof CeremonyLayer>['$props']['view']

const ceremonyAt = (startsAt: number, parties = 2, gag: CeremonyGag = 'trip', winners = 1): CeremonyView => ({
  startsAt: new Date(startsAt).toISOString(),
  endsAt: new Date(startsAt + ceremonyTimeline(parties, gag, winners).endMs).toISOString(),
  gag,
})
/** The Standings of `parties` Parties, the first `winners` of them on rank 1. */
const standingsOf = (parties: number, winners = 1) => Array.from({ length: parties }, (_, index) => ({ team: index + 1, rank: index < winners ? 1 : index + 1, points: index < winners ? 9 : Math.max(9 - index, 1) }))
const team = (position: number, name: string | null = null): BoardTeam => ({ position, name, frozen: true })
const player = (id: string, name: string, teamPosition: number): MemberView => memberView({ id, name, zone: 'team', team: teamPosition })
const people = (count: number, teamPosition: number): MemberView[] => Array.from({ length: count }, (_, index) => player(`p${teamPosition}-${index}`, `Leute ${teamPosition}-${index + 1}`, teamPosition))

/** A finished Event's read of two Parties: Wilde Gurken won with 9, Nacht Eulen have 3. */
const finished = (overrides: Partial<Layer> = {}): Layer => ({
  event: { name: 'Freitags-Zocken' },
  results: [{}, {}, {}] as Layer['results'],
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

/** The real rig (the #311 cases) or the stub. */
let realRig = false

async function mount(view: Layer, at = T0) {
  serverTime = at
  mounted = await mountSuspended(Page, { props: { view }, attachTo: document.body, global: { stubs: realRig ? {} : { CompibertRig: RigStub } } })
  await settle()
  return mounted
}

/** Lets the ticker's frame, the watchers and the dialog's focus run. */
async function settle() {
  vi.advanceTimersByTime(20)
  await nextTick()
  await flushPromises()
  await nextTick()
  await flushPromises()
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

const skipButton = () => [...(dialog()?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Überspringen') ?? null
const shareButton = () => [...(dialog()?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Bild teilen') ?? null
const closeButton = () => dialog()?.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')
const pageButton = () => document.querySelector<HTMLButtonElement>('#page-button')!
const text = () => dialog()?.textContent ?? ''
const cells = () => [...(dialog()?.querySelectorAll('ul[aria-label="Die Leute der Sieger"] > li') ?? [])]
const rows = () => [...(dialog()?.querySelectorAll('ol[aria-label="Endstand"] > li') ?? [])].map(row => [...row.children].map(part => part.textContent?.trim()).join(' '))

async function pressEscape(target: EventTarget) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await settle()
}

// The layer's `await loadGsap()` is a microtask under fake timers once the chunk has been imported.
beforeAll(() => loadGsap())

const originalAnimate = Element.prototype.animate

beforeEach(() => {
  chunk.fail = false
  chunk.loads = 0
  realRig = false
  Element.prototype.animate = vi.fn(() => ({ onfinish: null })) as unknown as typeof Element.prototype.animate
  serverTime = T0
  serverNow.mockClear()
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date(T0))
})

afterEach(() => {
  Element.prototype.animate = originalAnimate
  restoreScreen()
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
  const AFTER_STAMP = ceremonyTimeline(2, 'trip', 1).stampAtMs + 1000

  it('names the Winner in a polite live region inside the dialog', async () => {
    await mount(finished(), STARTS + AFTER_STAMP)

    expect(dialog()!.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite')
    expect(status()).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
  })
})

describe('focus', () => {
  it('moves from a page button to „Überspringen“ on opening, and back on closing', async () => {
    await mount(finished(), STARTS - 1000)
    pageButton().focus()

    await passTo(STARTS)
    expect(document.activeElement).toBe(skipButton())

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
})

describe('Compibert in the end frame (#311)', () => {
  const rig = () => dialog()?.querySelector('.compibert-rig') ?? null
  beforeEach(() => {
    realRig = true
  })

  it('is the animated rig, dancing once the run is over, and hidden from assistive technology', async () => {
    await mount(finished(), STARTS)
    await passTo(ENDS)

    expect(rig()).not.toBeNull()
    expect(rig()!.getAttribute('aria-hidden')).toBe('true')
    expect(rig()!.getAttribute('data-state')).toBe('dance')
    expect(rig()!.hasAttribute('tabindex')).toBe(false)
  })

  it('holds the cheer pose under reduced motion', async () => {
    motion('reduced')
    await mount(finished(), STARTS)

    expect(rig()!.getAttribute('data-state')).toBe('cheer')
    // The rig's own reduced path runs once GSAP has arrived: the pose is held, nothing loops.
    await vi.waitFor(() => expect(rig()!.getAttribute('data-held')).toBe('true'))
  })

  it('is mounted only while the layer is open: closing it takes the rig away', async () => {
    await mount(finished(), STARTS - 1000)
    expect(rig()).toBeNull()

    await passTo(STARTS)
    expect(rig()).not.toBeNull()

    closeButton()!.click()
    await settle()
    expect(rig()).toBeNull()
  })

  it('is the only Compibert in the layer: the still one is gone', async () => {
    await mount(finished(), STARTS)

    expect(dialog()!.querySelector('.compibert')).toBeNull()
  })
})

// The Pokal-Lauf (#312): the layer moves a paused GSAP timeline with the server's clock. A part is shown when its inline opacity is empty
// or 1 and hidden when it is 0 (asserted away from a tween), and the stub rig shows the pose the layer asked for.
const part = (name: string) => [...(dialog()?.querySelectorAll<HTMLElement>(`[data-part="${name}"]`) ?? [])]
const opacityOf = (element: HTMLElement) => element.style.opacity
const shown = (name: string) => part(name).length > 0 && part(name).every(element => opacityOf(element) === '' || Number(opacityOf(element)) === 1)
const hidden = (name: string) => part(name).length > 0 && part(name).every(element => Number(opacityOf(element)) === 0 && opacityOf(element) !== '')
const frame = () => dialog()?.getAttribute('data-frame')
const rigState = () => dialog()?.querySelector('[data-testid="rig"]')?.getAttribute('data-state')
const pieces = () => dialog()?.querySelectorAll('[class~="layer-confetti"] span').length ?? 0
const spoken = () => dialog()?.querySelector('[role="status"]')?.textContent?.trim()
const everyPartShown = () => ['banner', 'row', 'card', 'back', 'stamp', 'person'].every(shown) && hidden('front')

/** A finished Event of `parties` Parties with the gag, for the layer to play. */
function run(parties: number, gag: CeremonyGag, overrides: Partial<Layer> = {}): Layer {
  const ceremony = ceremonyAt(STARTS, parties, gag)
  // A fixture cannot lie: the stored end is the timeline's end.
  expect(Date.parse(ceremony.endsAt) - STARTS).toBe(ceremonyTimeline(parties, gag, 1).endMs)
  return finished({ ceremony, standings: standingsOf(parties), teams: [], members: [], ...overrides })
}

describe('a late joiner enters where the run is (#312)', () => {
  const { rowsAtMs, runAtMs, runEndAtMs, stampAtMs, endMs } = ceremonyTimeline(5, 'bonk', 1)
  const trip = ceremonyTimeline(5, 'trip', 1)

  it('at the first frame sees the banner above, no rows, no card, no stamp, no people, Compibert idle, no confetti', async () => {
    await mount(run(5, 'trip'), STARTS)

    expect(frame()).toBe('run')
    expect(part('banner')[0]!.style.transform).toContain('-140px')
    expect(hidden('row')).toBe(true)
    expect(hidden('card')).toBe(true)
    expect(hidden('stamp')).toBe(true)
    expect(hidden('person')).toBe(true)
    expect(rigState()).toBe('idle')
    expect(pieces()).toBe(0)
    expect(spoken()).toBe('')
  })

  it('mid-rows sees the first row in, and the last not yet', async () => {
    await mount(run(5, 'trip'), STARTS + rowsAtMs + 1350 + 10)

    // Four rows, the last place first: three have landed, the second place has just started.
    expect(part('row').filter(row => Number(opacityOf(row)) === 1)).toHaveLength(3)
    expect(hidden('card')).toBe(true)
  })

  it('mid-run sees Compibert running', async () => {
    await mount(run(5, 'trip'), STARTS + runAtMs + 300)

    expect(rigState()).toBe('run')
    expect(shown('card')).toBe(true)
    expect(hidden('stamp')).toBe(true)
  })

  it('in the trip sees him in suspense', async () => {
    await mount(run(5, 'trip'), STARTS + trip.runEndAtMs + 100)

    expect(rigState()).toBe('suspense')
  })

  it('in the bonk sees him cheer, then confused', async () => {
    await mount(run(5, 'bonk'), STARTS + runEndAtMs + 100)
    expect(rigState()).toBe('cheer')
    await passTo(STARTS + runEndAtMs + 1000)
    expect(rigState()).toBe('confused')
  })

  it('after the stamp sees the stamp, the back of the card and the people, Compibert laughing, and gets no confetti', async () => {
    await mount(run(5, 'bonk', { members: people(3, 1) }), STARTS + stampAtMs + 1000)

    expect(shown('stamp')).toBe(true)
    expect(shown('back')).toBe(true)
    expect(hidden('front')).toBe(true)
    expect(shown('person')).toBe(true)
    expect(rigState()).toBe('laugh')
    expect(pieces()).toBe(0)
    expect(spoken()).toBe('Gewonnen hat Team Rot, 9 Punkte.')
  })

  it('at one millisecond before the end is still in the run, dancing is not yet', async () => {
    await mount(run(5, 'bonk'), STARTS + endMs - 1)

    expect(frame()).toBe('run')
    expect(rigState()).toBe('laugh')
    expect(pieces()).toBe(0)
  })
})

describe('the stamp (#312)', () => {
  const { stampAtMs } = ceremonyTimeline(2, 'trip', 1)

  it('bursts 40 pieces of confetti on a wide screen when the clock crosses it, and the live region speaks then', async () => {
    stubScreen(true)
    await mount(finished(), STARTS)
    await passTo(STARTS + stampAtMs - 100)
    expect(pieces()).toBe(0)
    expect(spoken()).toBe('')

    await passTo(STARTS + stampAtMs + 50)

    expect(pieces()).toBe(40)
    expect(spoken()).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
  })

  it('bursts 20 on a phone', async () => {
    stubScreen(false)
    await mount(finished(), STARTS)
    await passTo(STARTS + stampAtMs - 100)

    await passTo(STARTS + stampAtMs + 50)

    expect(pieces()).toBe(20)
  })

  it('gives a tab that comes back 3 s after the stamp no confetti, but the announcement', async () => {
    await mount(finished(), STARTS)
    await passTo(STARTS + 500)

    await passTo(STARTS + stampAtMs + 1500)

    expect(pieces()).toBe(0)
    expect(spoken()).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
  })
})

async function mountAtEnd(view: Layer) {
  await mount(view, ENDS - 1)
  await passTo(ENDS)
}

describe('the end (#312)', () => {
  const CASES = [2, 5, 8].flatMap(parties => CEREMONY_GAGS.map(gag => [parties, gag] as const))

  it.each(CASES)('is the end frame at endsAt with %i Parties and the %s gag', async (parties, gag) => {
    const { endMs } = ceremonyTimeline(parties, gag, 1)
    await mount(run(parties, gag), STARTS)

    await passTo(STARTS + endMs - 1)
    expect(frame()).toBe('run')
    expect(skipButton()).not.toBeNull()

    await passTo(STARTS + endMs)
    expect(frame()).toBe('end')
    expect(skipButton()).toBeNull()
    expect(rigState()).toBe('dance')
    expect(everyPartShown()).toBe(true)
    expect(spoken()).toBe('Gewonnen hat Team Rot, 9 Punkte.')
  })

  it('has one row for 2 Parties and seven for 8', async () => {
    await mount(run(8, 'trip'), STARTS)

    expect(part('row')).toHaveLength(7)
  })

  it('shows 0, 1, 7 and 12 people at the end: the TeamMark, one, and „+N“', async () => {
    for (const [count, cellCount] of [[0, 1], [1, 1], [7, 6], [12, 6]] as const) {
      await mountAtEnd(run(2, 'trip', { members: people(count, 1) }))

      expect(cells(), String(count)).toHaveLength(cellCount)
      expect(everyPartShown(), String(count)).toBe(true)
      mounted!.unmount()
    }
  })

  it('shows the longest Team name in the card and the rows at the end', async () => {
    const longest = Array.from({ length: 6 }, () => 'W'.repeat(12)).join(' ')
    await mountAtEnd(run(2, 'trip', { teams: [team(1, longest), team(2, longest)] }))

    expect(part('card')[0]!.textContent).toContain(longest)
    expect(rows()[0]).toContain(longest)
  })
})

describe('Überspringen (#312)', () => {
  it('shows during the run with focus on it', async () => {
    await mount(finished(), STARTS)

    expect(skipButton()).not.toBeNull()
    expect(document.activeElement).toBe(skipButton())
  })

  it('shows the end frame for this viewer, moves focus to „Bild teilen“, speaks and fires no confetti', async () => {
    await mount(finished(), STARTS + 500)

    skipButton()!.click()
    await settle()

    expect(frame()).toBe('end')
    expect(everyPartShown()).toBe(true)
    expect(rigState()).toBe('dance')
    expect(skipButton()).toBeNull()
    expect(document.activeElement).toBe(shareButton())
    expect(spoken()).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
    expect(pieces()).toBe(0)
  })

  it('stays the end frame when the clock then passes the stamp and the end', async () => {
    await mount(finished(), STARTS + 500)
    skipButton()!.click()
    await settle()

    await passTo(STARTS + ceremonyTimeline(2, 'trip', 1).stampAtMs + 50)
    expect(pieces()).toBe(0)
    await passTo(ENDS + 100)

    expect(frame()).toBe('end')
    expect(everyPartShown()).toBe(true)
    expect(pieces()).toBe(0)
  })

  it('works at the first frame and at one millisecond before the end', async () => {
    await mount(finished(), STARTS)
    skipButton()!.click()
    await settle()
    expect(frame()).toBe('end')
    mounted!.unmount()

    await mount(finished(), ENDS - 1)
    skipButton()!.click()
    await settle()
    expect(frame()).toBe('end')
    expect(everyPartShown()).toBe(true)
  })

  it('leaves focus where it was when it was not on the button', async () => {
    await mount(finished(), STARTS + 500)
    pageButton().focus()

    skipButton()!.click()
    await settle()

    expect(document.activeElement).toBe(pageButton())
  })

  it('plays a new start from its own beginning again', async () => {
    await mount(finished(), STARTS + 500)
    skipButton()!.click()
    await settle()
    const later = ENDS + 10_000

    await passTo(later - CEREMONY_LEAD_MS)
    await refetch(finished({ ceremony: ceremonyAt(later) }))
    await passTo(later + 100)

    expect(frame()).toBe('run')
    expect(skipButton()).not.toBeNull()
    expect(hidden('stamp')).toBe(true)
  })
})

describe('reduced motion (#312)', () => {
  it('opens at the start with the end frame, no „Überspringen“, the cheer pose, no confetti and the announcement', async () => {
    motion('reduced')
    await mount(finished(), STARTS)

    expect(frame()).toBe('end')
    expect(skipButton()).toBeNull()
    expect(rigState()).toBe('cheer')
    expect(everyPartShown()).toBe(true)
    expect(spoken()).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
    expect(document.activeElement).toBe(closeButton())

    await passTo(STARTS + ceremonyTimeline(2, 'trip', 1).stampAtMs + 50)
    expect(pieces()).toBe(0)
  })
})

describe('closing during the run (#312)', () => {
  it('removes the layer and its confetti, and a refetch of the same start keeps it closed', async () => {
    stubScreen(true)
    const { stampAtMs } = ceremonyTimeline(2, 'trip', 1)
    await mount(finished(), STARTS)
    await passTo(STARTS + stampAtMs - 100)
    await passTo(STARTS + stampAtMs + 50)
    expect(pieces()).toBe(40)

    closeButton()!.click()
    await settle()
    expect(dialog()).toBeNull()
    expect(document.querySelector('[class~="layer-confetti"]')).toBeNull()

    await refetch(finished())
    await passTo(STARTS + stampAtMs + 500)
    expect(dialog()).toBeNull()
  })

  it('drops the old run for a new start while the old one plays, and plays the new one from its start', async () => {
    await mount(finished(), STARTS + 1000)
    const later = STARTS + 1500

    await refetch(finished({ ceremony: ceremonyAt(later) }))
    expect(dialog()).toBeNull()
    await passTo(later + 100)

    expect(frame()).toBe('run')
    expect(hidden('stamp')).toBe(true)
    expect(rigState()).toBe('idle')
  })
})

describe('when GSAP does not load (#312)', () => {
  it('shows the end frame as it is, without motion, and speaks', async () => {
    chunk.fail = true
    await mount(finished(), STARTS)

    expect(frame()).toBe('end')
    expect(skipButton()).toBeNull()
    expect(text()).toContain('SIEGER')
    expect(spoken()).toBe('Gewonnen hat Wilde Gurken, 9 Punkte.')
  })
})

describe('preloading GSAP (#312)', () => {
  it('asks for the chunk during the lead and for a late joiner, so it is there when the layer opens', async () => {
    await mount(finished(), STARTS - CEREMONY_LEAD_MS)
    expect(chunk.loads).toBeGreaterThan(0)
    mounted!.unmount()
    chunk.loads = 0

    await mount(finished(), STARTS + 1000)
    expect(chunk.loads).toBeGreaterThan(0)
  })

  it('does not ask for it on a finished Event opened after the run', async () => {
    await mount(finished(), ENDS + 60_000)

    expect(dialog()).toBeNull()
    expect(chunk.loads).toBe(0)
  })
})

describe('the line under the banner (#312)', () => {
  it('names the Event and its games', async () => {
    await mount(finished(), STARTS)

    expect(text()).toContain('Freitags-Zocken · 3 Spiele')
  })
})

describe('Bild teilen (#313)', () => {
  // The page around the layer with the share sheet it owns: the layer only asks, the sheet opens above it.
  const SLUG = 'ceremony-share'
  registerEndpoint(`/api/e/${SLUG}/share-image`, { method: 'GET', handler: () => new Blob(['png'], { type: 'image/png' }) })
  const sheetView = (view: Layer) => ({ ...view, event: { slug: SLUG, name: 'Freitags-Zocken' }, sessions: [], results: [] }) as unknown as EventView

  const WithShare = defineComponent({
    props: { view: { type: Object as PropType<Layer>, required: true } },
    setup(props) {
      const shareOpen = ref(false)
      return () => h('div', [
        h('main', { id: 'stage' }, [h('h1', { tabindex: -1 }, 'Freitags-Zocken'), h('button', { id: 'page-button', type: 'button' }, 'Seite')]),
        h(CeremonyLayer, { view: props.view, serverNow, onShare: () => { shareOpen.value = true } }),
        h(ShareDialog, { open: shareOpen.value, view: sheetView(props.view), onClose: () => { shareOpen.value = false } }),
      ])
    },
  })

  async function mountWithShare(at: number) {
    serverTime = at
    mounted = await mountSuspended(WithShare, { props: { view: finished() }, attachTo: document.body, global: { stubs: { CompibertRig: RigStub } } })
    await settle()
  }

  const sheet = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.textContent?.includes('Ergebnis teilen')) ?? null

  async function openSheetFromEndFrame() {
    await mountWithShare(STARTS + 500)
    skipButton()!.click()
    await settle()
    shareButton()!.click()
    await settle()
  }

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:ceremony')
    URL.revokeObjectURL = vi.fn()
  })

  it('is not in the run, and is in the end frame', async () => {
    await mountWithShare(STARTS + 500)
    expect(shareButton()).toBeNull()

    skipButton()!.click()
    await settle()

    expect(shareButton()).not.toBeNull()
  })

  it('is in the end frame the clock brings, too', async () => {
    await mountWithShare(ENDS - 1)
    expect(shareButton()).toBeNull()

    await passTo(ENDS + 100)

    expect(frame()).toBe('end')
    expect(shareButton()).not.toBeNull()
  })

  it('opens the sheet above the layer, which stays', async () => {
    await openSheetFromEndFrame()

    expect(sheet()).not.toBeNull()
    expect(dialog()!.textContent).toContain('Siegerehrung!')
    // The layer is the first dialog in the document, the sheet is mounted after it and so stands above it.
    expect(dialog()!.compareDocumentPosition(sheet()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('closes only the sheet on Escape, and gives the focus back to „Bild teilen“', async () => {
    await openSheetFromEndFrame()
    expect(sheet()!.contains(document.activeElement)).toBe(true)

    await pressEscape(document.activeElement!)

    expect(sheet()).toBeNull()
    expect(dialog()).not.toBeNull()
    expect(document.activeElement).toBe(shareButton())
  })

  it('closes the layer on the next Escape', async () => {
    await openSheetFromEndFrame()
    await pressEscape(document.activeElement!)

    await pressEscape(document.activeElement!)

    expect(dialog()).toBeNull()
  })
})

// A Tie (#315, spec #308, 12-siegerehrung-unentschieden.md): several Winners share the plate „Platz 1“. The trophy hops from card to card
// (a chain, 2 and on a wide screen 3 Winners) or lands on the plate (a grid), the plate stamps „Unentschieden“, and each Winner's people
// come in under or in its card. Happy-dom has no layout, so what is asserted is what a viewer or a screen reader would find, and when.
describe('a Tie (#315)', () => {
  const NAMES = ['Wilde Gurken', 'Nacht Eulen', 'Gelbe Gefahr', 'Käse Turbo', 'Grüne Welle', 'Blaue Bohnen', 'Pinke Panik', 'Team Orange']
  const named = (parties: number) => Array.from({ length: parties }, (_, index) => team(index + 1, NAMES[index]))

  /** A finished Event of `parties` Parties with the first `winners` on rank 1; the stored end is the default layout's (the server's). */
  function tie(parties: number, winners: number, gag: CeremonyGag = 'trip', overrides: Partial<Layer> = {}): Layer {
    const ceremony = ceremonyAt(STARTS, parties, gag, winners)
    expect(Date.parse(ceremony.endsAt) - STARTS).toBe(ceremonyTimeline(parties, gag, winners).endMs)
    return finished({ ceremony, standings: standingsOf(parties, winners), teams: named(parties), members: [], ...overrides })
  }

  const cards = () => [...(dialog()?.querySelectorAll('[data-testid="winner-card"]') ?? [])]
  const sieger = () => (text().match(/SIEGER/g) ?? []).length
  const list = (name: string) => dialog()?.querySelector(`ul[aria-label="${name}"]`) ?? null
  const items = (name: string) => [...(list(name)?.querySelectorAll(':scope > li') ?? [])]
  const chips = () => [...(dialog()?.querySelectorAll('ol[aria-label="Endstand"] > li') ?? [])]
  const plate = () => part('plate')[0]
  const tieEnd = (hasRows: boolean, people = 'person') => ['banner', 'plate', 'plate-stamp', 'card', 'back', 'stamp', people, ...(hasRows ? ['row'] : [])].every(shown) && hidden('front') && hidden('plate-front')

  async function atEnd(view: Layer, endMs: number) {
    await mount(view, STARTS + endMs - 1)
    await passTo(STARTS + endMs)
  }

  describe('the end frame', () => {
    it('shows one card and one „SIEGER“ per Winner under the plate with its stamp, 2 of 4 Parties on a wide screen', async () => {
      stubScreen(true)
      await atEnd(tie(4, 2), ceremonyTimeline(4, 'trip', 2).endMs)

      expect(frame()).toBe('end')
      expect(cards()).toHaveLength(2)
      expect(sieger()).toBe(2)
      expect(plate()!.textContent).toContain('Platz 1')
      expect(plate()!.textContent).toContain('Unentschieden')
      expect(dialog()!.querySelectorAll('ol[aria-label="Platz 1, unentschieden"] > li')).toHaveLength(2)
      expect(cards().map(card => card.textContent)).toEqual([expect.stringContaining('Wilde Gurken'), expect.stringContaining('Nacht Eulen')])
      expect(cards()[0]!.textContent).toContain('9 P.')
      expect(tieEnd(true)).toBe(true)
    })

    it('hides the „=“ badges from assistive technology', async () => {
      stubScreen(true)
      await atEnd(tie(4, 2), ceremonyTimeline(4, 'trip', 2).endMs)

      const badges = part('badge')
      expect(badges).toHaveLength(1)
      expect(badges[0]!.getAttribute('aria-hidden')).toBe('true')
    })

    it('lists the Players of every Winning Party in a list named for the Party, never the other Party', async () => {
      stubScreen(true)
      const members = [player('a', 'Anna', 1), player('b', 'Bert', 1), player('c', 'Cleo', 2), player('d', 'Dora', 3)]
      await atEnd(tie(4, 2, 'trip', { members }), ceremonyTimeline(4, 'trip', 2).endMs)

      expect(items('Wilde Gurken').map(item => item.textContent?.trim())).toEqual(['Anna', 'Bert'])
      expect(items('Nacht Eulen').map(item => item.textContent?.trim())).toEqual(['Cleo'])
      expect(items('Gelbe Gefahr')).toEqual([])
      expect(items('Wilde Gurken').every(item => item.querySelector('img') !== null)).toBe(true)
    })

    it('shows 5 avatars and „+2“ for a Party with 7 Players, and its TeamMark and name for a Party with none', async () => {
      stubScreen(true)
      await atEnd(tie(3, 2, 'trip', { members: people(7, 1) }), ceremonyTimeline(3, 'trip', 2).endMs)

      expect(items('Wilde Gurken')).toHaveLength(6)
      expect(items('Wilde Gurken')[5]!.textContent).toContain('+2')
      expect(items('Nacht Eulen')).toHaveLength(1)
      expect(items('Nacht Eulen')[0]!.textContent?.trim()).toBe('Nacht Eulen')
      expect(items('Nacht Eulen')[0]!.querySelector('img')).toBeNull()
      expect(items('Nacht Eulen')[0]!.querySelector('svg')).not.toBeNull()
    })

    it('shows exactly 6 Players of a Party without a „+N“', async () => {
      stubScreen(true)
      await atEnd(tie(3, 2, 'trip', { members: people(6, 1) }), ceremonyTimeline(3, 'trip', 2).endMs)

      expect(items('Wilde Gurken')).toHaveLength(6)
      expect(list('Wilde Gurken')!.textContent).not.toContain('weitere')
    })

    it('puts the places below the Winners as rows with shared ranks on a wide screen and on a phone, and none when every Party won', async () => {
      stubScreen(true)
      await atEnd(tie(4, 2), ceremonyTimeline(4, 'trip', 2).endMs)
      expect(rows()).toEqual(['3 Gelbe Gefahr 7 P.', '4 Käse Turbo 6 P.'])
      mounted!.unmount()

      stubScreen(false)
      await atEnd(tie(4, 2), ceremonyTimeline(4, 'trip', 2).endMs)
      expect(rows()).toEqual(['3 Gelbe Gefahr 7 P.', '4 Käse Turbo 6 P.'])
      mounted!.unmount()

      stubScreen(true)
      await atEnd(tie(2, 2), ceremonyTimeline(2, 'trip', 2).endMs)
      expect(rows()).toEqual([])
      expect(part('row')).toHaveLength(0)
      expect(cards()).toHaveLength(2)
    })

    it('shows the places below 3 Winners as one line of chips with rank, name and points', async () => {
      stubScreen(true)
      await atEnd(tie(5, 3), ceremonyTimeline(5, 'trip', 3).endMs)

      expect(chips().map(chip => [...chip.children].map(part => part.textContent?.trim()).filter(Boolean).join(' '))).toEqual(['4 Käse Turbo 6 P.', '5 Grüne Welle 5 P.'])
      expect(cards()).toHaveLength(3)
    })

    it('shows all 8 Winners of 8 Parties as compact cards with their people in a stack named for the Party and its Players', async () => {
      stubScreen(false)
      const members = [player('a', 'Anna', 1), player('b', 'Bert', 1), ...people(7, 2)]
      await atEnd(tie(8, 8, 'bonk', { members }), ceremonyTimeline(8, 'bonk', 8, true).endMs)

      expect(frame()).toBe('end')
      expect(cards()).toHaveLength(8)
      expect(sieger()).toBe(8)
      expect(rows()).toEqual([])
      expect(plate()!.textContent).toContain('Unentschieden')
      expect(dialog()!.querySelector('ul[aria-label="Wilde Gurken: Anna, Bert"]')).not.toBeNull()
      expect(dialog()!.querySelector('ul[aria-label^="Nacht Eulen: Leute 2-1"]')).not.toBeNull()
      expect(dialog()!.querySelector('ul[aria-label$="2 weitere"]')).not.toBeNull()
      expect(tieEnd(false, 'stack')).toBe(true)
    })

    it('shows the longest Team name in full in the DOM of a card and of its list', async () => {
      stubScreen(true)
      const longest = Array.from({ length: 6 }, () => 'W'.repeat(12)).join(' ')
      await atEnd(tie(2, 2, 'trip', { teams: [team(1, longest), team(2, 'B')], members: [player('a', 'Anna', 1)] }), ceremonyTimeline(2, 'trip', 2).endMs)

      expect(cards()[0]!.textContent).toContain(longest)
      expect(items(longest)).toHaveLength(1)
    })

    it('keeps Winners that are not adjacent teams in ascending order', async () => {
      stubScreen(true)
      const standings = [{ team: 1, rank: 1, points: 5 }, { team: 2, rank: 4, points: 1 }, { team: 3, rank: 1, points: 5 }, { team: 8, rank: 1, points: 5 }]
      await atEnd(tie(4, 3, 'trip', { standings, teams: [team(1, 'Eins'), team(2, 'Zwei'), team(3, 'Drei'), team(8, 'Acht')] }), ceremonyTimeline(4, 'trip', 3).endMs)

      expect(cards().map(card => card.textContent)).toEqual([expect.stringContaining('Eins'), expect.stringContaining('Drei'), expect.stringContaining('Acht')])
    })
  })

  describe('the live region', () => {
    const { stampAtMs } = ceremonyTimeline(4, 'trip', 2)

    it('names all Winners with the rows below, once the plate has stamped and not before', async () => {
      stubScreen(true)
      await mount(tie(4, 2), STARTS)
      await passTo(STARTS + stampAtMs - 100)
      expect(spoken()).toBe('')

      await passTo(STARTS + stampAtMs + 50)

      expect(spoken()).toBe('Unentschieden! Gewonnen haben Wilde Gurken und Nacht Eulen mit je 9 Punkten.')
    })

    it('says „Beide Parteien“ when both of 2 Parties won', async () => {
      stubScreen(true)
      await mount(tie(2, 2), STARTS + ceremonyTimeline(2, 'trip', 2).stampAtMs + 100)

      expect(spoken()).toBe('Unentschieden! Beide Parteien gewinnen mit je 9 Punkten: Wilde Gurken und Nacht Eulen.')
    })

    it('says „Alle 8 Parteien“ when all 8 won', async () => {
      stubScreen(false)
      await mount(tie(8, 8), STARTS + ceremonyTimeline(8, 'trip', 8, true).stampAtMs + 100)

      expect(spoken()).toBe('Unentschieden! Alle 8 Parteien gewinnen mit je 9 Punkten: Wilde Gurken, Nacht Eulen, Gelbe Gefahr, Käse Turbo, Grüne Welle, Blaue Bohnen, Pinke Panik und Team Orange.')
    })

    it('says the line under the banner for the Tie', async () => {
      stubScreen(true)
      await mount(tie(4, 2), STARTS)

      expect(text()).toContain('Freitags-Zocken · 3 Spiele · 2 Sieger, je 9 Punkte')
    })
  })

  describe('a late joiner', () => {
    it('after the plate\'s stamp sees every stamp, the plate stamped, the people, Compibert laughing, no confetti and the sentence', async () => {
      stubScreen(true)
      const { stampAtMs } = ceremonyTimeline(4, 'bonk', 2)
      await mount(tie(4, 2, 'bonk', { members: [player('a', 'Anna', 1), player('c', 'Cleo', 2)] }), STARTS + stampAtMs + 1000)

      expect(frame()).toBe('run')
      expect(shown('stamp')).toBe(true)
      expect(shown('plate-stamp')).toBe(true)
      expect(hidden('plate-front')).toBe(true)
      expect(hidden('front')).toBe(true)
      expect(shown('person')).toBe(true)
      expect(rigState()).toBe('laugh')
      expect(pieces()).toBe(0)
      expect(spoken()).toContain('Unentschieden!')
    })

    it('after the first hop sees the first card flipped and the second not, and gets no confetti for the hops that passed', async () => {
      stubScreen(true)
      const { landAtMs } = ceremonyTimeline(4, 'trip', 2)
      await mount(tie(4, 2), STARTS + landAtMs + 300)

      expect(opacityOf(part('back')[0]!)).toBe('1')
      expect(Number(opacityOf(part('back')[1]!))).toBe(0)
      expect(pieces()).toBe(0)
    })

    it('at the first frame sees the plate and the cards not yet in', async () => {
      stubScreen(true)
      await mount(tie(4, 2), STARTS)

      expect(hidden('plate')).toBe(true)
      expect(hidden('card')).toBe(true)
      expect(hidden('row')).toBe(true)
      expect(hidden('person')).toBe(true)
      expect(spoken()).toBe('')
    })
  })

  describe('the confetti', () => {
    it('bursts 14 pieces on a card as the trophy lands on it, then 14 on the next and 40 on the plate at the stamp, on a wide screen', async () => {
      stubScreen(true)
      const { landAtMs, stampAtMs } = ceremonyTimeline(3, 'trip', 2)
      await mount(tie(3, 2), STARTS)
      await passTo(STARTS + landAtMs - 100)
      expect(pieces()).toBe(0)

      await passTo(STARTS + landAtMs + 50)
      expect(pieces()).toBe(14)

      await passTo(STARTS + landAtMs + 600)
      expect(pieces()).toBe(14 + 14)

      await passTo(STARTS + stampAtMs - 50)
      await passTo(STARTS + stampAtMs + 50)
      expect(pieces()).toBe(14 + 14 + 40)
    })

    it('bursts 8 per card and 20 on the plate on a phone', async () => {
      stubScreen(false)
      const { landAtMs, stampAtMs } = ceremonyTimeline(3, 'trip', 2)
      await mount(tie(3, 2), STARTS)
      await passTo(STARTS + landAtMs - 100)

      await passTo(STARTS + landAtMs + 50)
      expect(pieces()).toBe(8)

      await passTo(STARTS + landAtMs + 600)
      await passTo(STARTS + stampAtMs - 50)
      await passTo(STARTS + stampAtMs + 50)
      expect(pieces()).toBe(8 + 8 + 20)
    })

    it('has no confetti per card in a grid, only the plate\'s', async () => {
      stubScreen(true)
      const { landAtMs, stampAtMs } = ceremonyTimeline(8, 'trip', 8)
      await mount(tie(8, 8), STARTS)
      await passTo(STARTS + landAtMs - 100)
      await passTo(STARTS + landAtMs + 100)
      expect(pieces()).toBe(0)

      await passTo(STARTS + stampAtMs + 50)
      expect(pieces()).toBe(40)
    })
  })

  describe('the end', () => {
    it('is the end frame at the stored end, with 2 of 4 Parties and both gags', async () => {
      stubScreen(true)
      for (const gag of CEREMONY_GAGS) {
        const { endMs } = ceremonyTimeline(4, gag, 2)
        await mount(tie(4, 2, gag), STARTS)

        await passTo(STARTS + endMs - 1)
        expect(frame(), gag).toBe('run')
        await passTo(STARTS + endMs)
        expect(frame(), gag).toBe('end')
        expect(rigState(), gag).toBe('dance')
        expect(tieEnd(true), gag).toBe(true)
        mounted!.unmount()
      }
    })

    it('ends a phone\'s grid of 3 Winners before the stored chain end, never after it', async () => {
      stubScreen(false)
      const grid = ceremonyTimeline(3, 'trip', 3, true)
      const stored = ceremonyTimeline(3, 'trip', 3)
      await mount(tie(3, 3), STARTS)

      await passTo(STARTS + grid.endMs - 1)
      expect(frame()).toBe('run')
      await passTo(STARTS + grid.endMs)
      expect(frame()).toBe('end')
      expect(grid.endMs).toBeLessThanOrEqual(stored.endMs)
      expect(dialog()).not.toBeNull()
    })
  })

  describe('Überspringen and reduced motion', () => {
    it('shows the end frame at once, speaks the sentence, and fires no confetti', async () => {
      stubScreen(true)
      await mount(tie(4, 2), STARTS + 500)

      skipButton()!.click()
      await settle()

      expect(frame()).toBe('end')
      expect(tieEnd(true)).toBe(true)
      expect(rigState()).toBe('dance')
      expect(spoken()).toBe('Unentschieden! Gewonnen haben Wilde Gurken und Nacht Eulen mit je 9 Punkten.')
      expect(pieces()).toBe(0)
      await passTo(STARTS + ceremonyTimeline(4, 'trip', 2).stampAtMs + 50)
      expect(pieces()).toBe(0)
    })

    it('opens with the end frame, Compibert cheering, no confetti and the sentence, 2 of 2 and 8 of 8', async () => {
      motion('reduced')
      for (const [parties, winners, wide] of [[2, 2, true], [8, 8, false]] as const) {
        stubScreen(wide)
        await mount(tie(parties, winners), STARTS)

        expect(frame()).toBe('end')
        expect(skipButton()).toBeNull()
        expect(rigState()).toBe('cheer')
        expect(tieEnd(false, winners === 8 ? 'stack' : 'person')).toBe(true)
        expect(spoken()).toContain('Unentschieden!')
        await passTo(STARTS + ceremonyTimeline(parties, 'trip', winners).stampAtMs + 50)
        expect(pieces()).toBe(0)
        mounted!.unmount()
      }
    })
  })
})
