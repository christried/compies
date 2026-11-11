import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import HubNav from '~/components/HubNav.vue'
import type { EventContext } from '~/utils/event-page'
import { kitty, signInAs } from './auth'

function link(nav: VueWrapper, label: string) {
  const found = nav.findAll('a').find(a => a.text() === label)
  if (!found) throw new Error(`no nav item "${label}"`)
  return found
}

const labels = (nav: VueWrapper) => nav.findAll('a').map(a => a.text())

describe('HubNav', () => {
  beforeEach(() => signInAs(kitty))

  it('marks the item of the current area as the current page', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: true, isAdmin: false } }, route: '/bibliothek' })

    expect(link(nav, 'Bibliothek').attributes('aria-current')).toBe('page')
    expect(link(nav, 'Events').attributes('aria-current')).toBeUndefined()
  })

  it('marks Events as current on Home', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'tabs' }, route: '/' })

    expect(link(nav, 'Events').attributes('aria-current')).toBe('page')
  })

  it('flags Archiv as Baustelle, with a tape marker, and leaves Events, Bibliothek and Profil alone (#399)', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: true, isAdmin: false } }, route: '/' })

    expect(link(nav, 'Archiv').attributes('aria-description')).toBe('Baustelle')
    expect(link(nav, 'Archiv').find('[title="Baustelle"]').exists()).toBe(true)
    for (const label of ['Events', 'Bibliothek', 'Profil']) {
      expect(link(nav, label).attributes('aria-description')).toBeUndefined()
      expect(link(nav, label).find('[title="Baustelle"]').exists()).toBe(false)
    }
  })

  it('hides Bibliothek and Admin from a User without rights', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header' }, route: '/' })

    expect(labels(nav)).toEqual(['Events', 'Archiv', 'Profil'])
  })

  it('gives every item the hover tint, so the Dunkel fix of the utility reaches the nav (#406)', async () => {
    const viewers = [undefined, { canHost: false, isAdmin: true }]
    for (const layout of ['header', 'tabs'] as const) {
      for (const viewer of viewers) {
        const nav = await mountSuspended(HubNav, { props: { layout, viewer }, route: '/' })
        const links = nav.findAll('a')
        expect(links).toHaveLength(viewer ? 5 : 3)
        for (const item of links) expect(item.classes(), `${layout}: ${item.text()}`).toContain('hover:tint')
      }
    }
  })

  it('shows Bibliothek, and not Admin, to a User with the Host permission', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'tabs', viewer: { canHost: true, isAdmin: false } }, route: '/' })

    expect(labels(nav)).toEqual(['Events', 'Archiv', 'Bibliothek', 'Profil'])
  })

  it('shows Bibliothek and Admin to the Platform admin', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: false, isAdmin: true } }, route: '/' })

    expect(labels(nav)).toEqual(['Events', 'Archiv', 'Bibliothek', 'Profil', 'Admin'])
    expect(link(nav, 'Admin').attributes('href')).toBe('/admin')
  })

  it('shows Bibliothek to the Platform admin even when the Host flag is not set', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: { canHost: false, isAdmin: true } }, route: '/' })

    expect(labels(nav)).toContain('Bibliothek')
  })
})

// The Event page's header (#426): the nav stays, Events is current on an Event's route, and the Event's name and Phase hang under it.
describe('HubNav on an Event page', () => {
  beforeEach(() => signInAs(kitty))

  const EVENT = '/e/freitags-zocken-k7q2'
  const HOST = { canHost: true, isAdmin: false }
  const context = (over: Partial<EventContext> = {}): EventContext => ({ name: 'Freitags-Zocken', phase: 'running', label: undefined, ...over })
  const current = (nav: VueWrapper) => nav.findAll('[aria-current]')
  /** The second line of the context tab: the one aria-hidden element with words in it (the icons and markers have none). */
  const secondLine = (a: DOMWrapper<Element>) => a.findAll('[aria-hidden="true"]').find(element => element.text() !== '')
  /** The pill: the innermost element that says the Phase word. */
  const pillOf = (a: DOMWrapper<Element>) => secondLine(a)!.findAll('span').filter(span => span.text() === 'Läuft').at(-1)!
  const describedBy = (nav: VueWrapper, a: DOMWrapper<Element>) => nav.get(`#${a.attributes('aria-describedby')}`)

  for (const layout of ['header', 'tabs'] as const) {
    for (const route of [EVENT, `${EVENT}/einstellungen`]) {
      it(`counts ${route} as Events, in the ${layout} layout`, async () => {
        const nav = await mountSuspended(HubNav, { props: { layout, viewer: HOST }, route })

        expect(current(nav)).toHaveLength(1)
        expect(link(nav, 'Events').attributes('aria-current')).toBe('page')
      })
    }
  }

  it('keeps no item current on a route that is no area', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header' }, route: '/gibt-es-nicht' })

    expect(current(nav)).toHaveLength(0)
  })

  it('hangs the name and the Phase under Events, and describes the tab in full for a screen reader', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: HOST, context: context() }, route: EVENT })
    const events = nav.findAll('a')[0]!

    expect(current(nav)).toHaveLength(1)
    expect(events.attributes('aria-current')).toBe('page')
    const line = secondLine(events)!
    expect(line.text()).toContain('Freitags-Zocken')
    expect(line.text()).toContain('Läuft')
    expect(events.text().startsWith('Events')).toBe(true)
    const description = describedBy(nav, events)
    expect(description.text()).toBe('Event: Freitags-Zocken, Phase: Läuft')
    expect(description.classes()).toContain('sr-only')
    expect(events.element.contains(description.element)).toBe(false)
    expect(nav.get('nav').element.contains(description.element)).toBe(true)
  })

  it('says the page’s label instead of the Phase word, as the pill does', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context({ label: 'Läuft · Session 1 von 2' }) }, route: EVENT })
    const events = nav.findAll('a')[0]!

    expect(describedBy(nav, events).text()).toBe('Event: Freitags-Zocken, Phase: Läuft · Session 1 von 2')
    expect(secondLine(events)!.text()).toContain('Läuft · Session 1 von 2')
  })

  it.each([
    ['draft', 'Entwurf'],
    ['poll', 'Terminumfrage'],
    ['date_set', 'Termin steht'],
    ['running', 'Läuft'],
    ['finished', 'Beendet'],
    ['archived', 'Archiv'],
  ] as const)('names the Phase %s as „%s“', async (phase, word) => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context({ phase }) }, route: EVENT })
    const events = nav.findAll('a')[0]!

    expect(describedBy(nav, events).text()).toBe(`Event: Freitags-Zocken, Phase: ${word}`)
    expect(secondLine(events)!.text()).toContain(word)
  })

  it.each([
    ['a signed-out User or a Member', undefined, ['Events', 'Archiv', 'Profil']],
    ['a Host', HOST, ['Events', 'Archiv', 'Bibliothek', 'Profil']],
    ['the Platform admin', { canHost: false, isAdmin: true }, ['Events', 'Archiv', 'Bibliothek', 'Profil', 'Admin']],
  ])('lists the items of %s with the context, by the same rules as without', async (_who, viewer, expected) => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer, context: context() }, route: EVENT })

    expect(nav.findAll('a').map(a => a.text().split('Freitags-Zocken')[0]!.trim())).toEqual(expected)
    expect(current(nav)).toHaveLength(1)
  })

  it('gives only Events a second line, and keeps the other items as they are', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', viewer: HOST, context: context() }, route: EVENT })

    for (const label of ['Archiv', 'Bibliothek', 'Profil']) {
      const item = link(nav, label)
      expect(secondLine(item), label).toBeUndefined()
      expect(item.attributes('aria-describedby'), label).toBeUndefined()
      expect(item.classes(), label).toEqual(expect.arrayContaining(['hover:tint', 'border-transparent']))
    }
  })

  it('keeps the hover tint on the context tab, too', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context() }, route: EVENT })

    expect(nav.findAll('a')[0]!.classes()).toContain('hover:tint')
  })

  it('leaves the Events link as it was without a context', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header' }, route: EVENT })
    const events = nav.findAll('a')[0]!

    expect(events.attributes('aria-describedby')).toBeUndefined()
    expect(secondLine(events)).toBeUndefined()
    expect(events.text()).toBe('Events')
    expect(nav.findAll('.sr-only')).toHaveLength(0)
  })

  it('shows no context on the tab bar', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'tabs', context: context() }, route: EVENT })

    expect(nav.text()).not.toContain('Freitags-Zocken')
  })

  it('hangs the context on the current tab also where the route is Home', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context() }, route: '/' })

    expect(secondLine(nav.findAll('a')[0]!)!.text()).toContain('Freitags-Zocken')
  })

  it('does not hang it on a tab that is not current', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context() }, route: '/archiv' })

    expect(nav.text()).not.toContain('Freitags-Zocken')
  })

  it('cuts a 60-character name to one line with the full name as its title, and never shortens the pill', async () => {
    const name = 'Großer Herbst-Spieleabend bei Sanne mit Pizza, Quiz und Co.!'
    expect(name).toHaveLength(60)
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context({ name }) }, route: EVENT })
    const events = nav.findAll('a')[0]!

    const title = events.get(`[title="${name}"]`)
    expect(title.classes()).toEqual(expect.arrayContaining(['truncate', 'min-w-0']))
    const pill = pillOf(events)
    expect(pill.classes()).toContain('flex-none')
    expect(pill.classes()).not.toContain('truncate')
    expect(describedBy(nav, events).text()).toBe(`Event: ${name}, Phase: Läuft`)
  })

  it('shows the second line with the small pill', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context() }, route: EVENT })
    const pill = pillOf(nav.findAll('a')[0]!)

    expect(pill.classes()).toContain('h-[18px]')
  })

  // 15-header-eventseite § HubNav Motion: jsdom computes no transition, so the test reads the classes and the tokens they stand for.
  it('lets the second line in with dur-base and ease-out from 4 px below, and cross-fades a change of name and Phase with dur-fast', async () => {
    const nav = await mountSuspended(HubNav, { props: { layout: 'header', context: context() }, route: EVENT })
    const [enter, ...fades] = nav.findAllComponents({ name: 'Transition' })

    expect(enter!.props('appear')).toBe(true)
    expect(enter!.props('enterActiveClass')).toEqual(expect.stringContaining('dur-base'))
    expect(enter!.props('enterActiveClass')).toEqual(expect.stringContaining('ease-out'))
    expect(enter!.props('enterActiveClass')).toEqual(expect.stringContaining('reduced:transition-none'))
    expect(enter!.props('enterActiveClass')).toEqual(expect.stringContaining('motion-reduce:transition-none'))
    expect(enter!.props('enterFromClass')).toBe('opacity-0 translate-y-1')
    expect(enter!.props('leaveActiveClass')).toBeUndefined()
    expect(fades).toHaveLength(2)
    for (const fade of fades) {
      expect(fade.props('mode')).toBe('out-in')
      expect(fade.props('enterActiveClass')).toEqual(expect.stringContaining('dur-fast'))
      expect(fade.props('leaveActiveClass')).toEqual(expect.stringContaining('dur-fast'))
      expect(fade.props('enterActiveClass')).toEqual(expect.stringContaining('reduced:transition-none'))
      expect(fade.props('leaveToClass')).toBe('opacity-0')
    }
  })
})
