import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import AppShell from '~/components/AppShell.vue'
import { kitty, signInAs } from './auth'

// The header's three kinds (#426, 15-header-eventseite § AppHeader). jsdom applies no CSS, so what is visible at a width is asserted on
// the class, as the hub nav's `max-md:hidden` is. The Event kind shows the nav from md (980 px, where the hub pages show it) on.

const NAV = 'nav[aria-label="Hauptnavigation"]'
const EVENT = { name: 'Freitags-Zocken', phase: 'running', label: undefined } as const

async function mountHeader(kind: 'hub' | 'event' | 'bare', event?: typeof EVENT, route = '/e/freitags-zocken-k7q2') {
  const page = await mountSuspended(AppShell, {
    props: { kind, event },
    slots: {
      title: '<p>Titel für Phones</p>',
      actions: '<button type="button">Aktion</button>',
    },
    route,
  })
  return page.get('header')
}

/** What `get` returns: a wrapper without `exists`. */
type Part = Pick<DOMWrapper<Element>, 'findAll'>

const secondLine = (a: Part) => a.findAll('[aria-hidden="true"]').find(element => element.text() !== '')
const wordmark = (header: Part) => header.findAll('span').find(span => span.text() === 'Compies')

describe('the header of the Event kind', () => {
  beforeEach(() => signInAs(kitty))

  it('has the hub nav with Events current and the Event under it', async () => {
    const header = await mountHeader('event', EVENT)

    expect(header.findAll(NAV)).toHaveLength(1)
    const events = header.get(`${NAV} a`)
    expect(events.attributes('aria-current')).toBe('page')
    expect(header.findAll('[aria-current]')).toHaveLength(1)
    expect(secondLine(events)!.text()).toContain('Freitags-Zocken')
    expect(secondLine(events)!.text()).toContain('Läuft')
  })

  it('shows the nav from md up, as on the hub pages, and its own space before the actions', async () => {
    const header = await mountHeader('event', EVENT)

    expect(header.get(NAV).classes()).toContain('max-md:hidden')
    const spacer = header.get(NAV).element.nextElementSibling!
    expect(spacer.className).toEqual(expect.stringContaining('flex-1'))
    expect(spacer.className).toEqual(expect.stringContaining('min-w-[8px]'))
    expect(spacer.className).toEqual(expect.stringContaining('max-md:hidden'))
  })

  it('keeps the title for phones, and hides it from md up where the tab holds the Event', async () => {
    const header = await mountHeader('event', EVENT)

    const title = header.findAll('p').find(p => p.text() === 'Titel für Phones')!
    expect(title.element.parentElement!.className).toEqual(expect.stringContaining('md:hidden'))
  })

  it('has no divider beside the logo', async () => {
    const header = await mountHeader('event', EVENT)

    expect(header.findAll('span').filter(span => span.classes().includes('w-0.5'))).toHaveLength(0)
  })

  it('hides the wordmark below 1024 px, and shows it from there', async () => {
    const header = await mountHeader('event', EVENT)

    expect(wordmark(header)!.classes()).toContain('max-[63.99rem]:hidden')
    expect(wordmark(header)!.classes()).not.toContain('max-md:hidden')
  })

  it('puts the page’s actions in the header', async () => {
    const header = await mountHeader('event', EVENT)

    expect(header.findAll('button').some(button => button.text() === 'Aktion')).toBe(true)
  })

  it('shows plain Events as current without an Event (loading, a sub-route), and no second line', async () => {
    const header = await mountHeader('event')

    expect(header.findAll(NAV)).toHaveLength(1)
    const events = header.get(`${NAV} a`)
    expect(events.attributes('aria-current')).toBe('page')
    expect(events.text()).toBe('Events')
    expect(secondLine(events)).toBeUndefined()
  })
})

describe('the header of the other kinds', () => {
  beforeEach(() => signInAs(kitty))

  it('shows the hub nav of the hub kind from md up, with no context line, and the wordmark at every width', async () => {
    const header = await mountHeader('hub', EVENT, '/archiv')

    expect(header.get(NAV).classes()).toContain('max-md:hidden')
    expect(header.get(NAV).text()).not.toContain('Freitags-Zocken')
    expect(header.get(`${NAV} [aria-current]`).text()).toBe('Archiv')
    expect(wordmark(header)!.classes().filter(name => name.includes('hidden'))).toEqual([])
  })

  it('has no nav in the bare kind', async () => {
    const header = await mountHeader('bare', undefined, '/anmelden')

    expect(header.findAll(NAV)).toHaveLength(0)
  })

  it('keeps the logo’s name in every kind', async () => {
    for (const kind of ['hub', 'event', 'bare'] as const) {
      const header = await mountHeader(kind, EVENT)

      expect(header.get('a[href="/"]').attributes('aria-label'), kind).toBe('Compies')
    }
  })
})
