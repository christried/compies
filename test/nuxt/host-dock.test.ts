import { mountSuspended } from '@nuxt/test-utils/runtime'
import { Crown } from '@lucide/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HostDock, { type DockAction } from '~/components/HostDock.vue'

function action(label: string, overrides: Partial<DockAction> = {}): DockAction {
  return { key: label, label, icon: Crown, group: 'Event', run: () => {}, ...overrides }
}

const pillLabels = (page: Awaited<ReturnType<typeof mountSuspended>>) =>
  page.get('[role="toolbar"]').findAll('button').map(button => button.text())

// Focus moves are only visible on an attached tree.
const mountAttached = (actions: DockAction[]) => mountSuspended(HostDock, { props: { actions }, attachTo: document.body })

describe('HostDock', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows up to three actions in the pill, and no Mehr while nothing is left over', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('Termin festlegen'), action('Einladen'), action('Einstellungen')] } })

    expect(pillLabels(page)).toEqual(['Termin festlegen', 'Einladen', 'Einstellungen'])
    expect(page.find('[aria-haspopup="menu"]').exists()).toBe(false)
    page.unmount()
  })

  it('ends the pill with Mehr when a fourth action waits, and the pill shows the first three', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('A'), action('B'), action('C'), action('D')] } })

    expect(pillLabels(page)).toEqual(['A', 'B', 'C', 'Mehr'])
    expect(page.get('[aria-haspopup="menu"]').attributes('aria-expanded')).toBe('false')
    page.unmount()
  })

  it('keeps an action placed in Mehr out of the pill', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('A'), action('B', { place: 'more' }), action('C')] } })

    expect(pillLabels(page)).toEqual(['A', 'C', 'Mehr'])
    page.unmount()
  })

  it('lists every action in Mehr, grouped, and a disabled one says why and still runs', async () => {
    const run = vi.fn()
    const page = await mountSuspended(HostDock, { props: { actions: [
      action('Termin festlegen', { group: 'Termine', primary: true, disabledReason: 'Noch kein Termin gewählt.', run }),
      action('Einladen', { group: 'Leute' }),
      action('Termine bearbeiten', { group: 'Termine', place: 'more' }),
      action('Einstellungen', { group: 'Event', place: 'more' }),
    ] } })

    await page.get('[aria-haspopup="menu"]').trigger('click')

    const menu = page.get('[role="menu"]')
    expect(menu.attributes('aria-label')).toBe('Host-Steuerung')
    expect(menu.findAll('[role="group"]').map(group => group.attributes('aria-label'))).toEqual(['Termine', 'Leute', 'Event'])
    expect(menu.findAll('[role="menuitem"]').map(item => item.text())).toEqual([
      'Termin festlegen Noch kein Termin gewählt.',
      'Termine bearbeiten',
      'Einladen',
      'Einstellungen',
    ])
    const disabled = menu.findAll('[role="menuitem"]')[0]!
    expect(disabled.attributes('aria-disabled')).toBe('true')

    await disabled.trigger('click')

    expect(run).toHaveBeenCalledOnce()
    expect(page.find('[role="menu"]').exists()).toBe(false)
    page.unmount()
  })

  it('moves focus into the menu on open, walks the items with the arrows, and Escape gives focus back to Mehr', async () => {
    const page = await mountAttached([action('A'), action('B'), action('C'), action('D', { place: 'more' })])
    const more = page.get('[aria-haspopup="menu"]')

    await more.trigger('click')
    const items = page.findAll('[role="menuitem"]')
    expect(document.activeElement).toBe(items[0]!.element)

    await items[0]!.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1]!.element)

    await items[1]!.trigger('keydown', { key: 'ArrowUp' })
    await items[0]!.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[items.length - 1]!.element)

    await items[items.length - 1]!.trigger('keydown', { key: 'Escape' })
    expect(page.find('[role="menu"]').exists()).toBe(false)
    expect(more.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(more.element)
    page.unmount()
  })

  it('closes on a click outside and gives focus back to Mehr', async () => {
    const page = await mountAttached([action('A'), action('B'), action('C'), action('D', { place: 'more' })])
    await page.get('[aria-haspopup="menu"]').trigger('click')
    expect(page.find('[role="menu"]').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    await vi.waitFor(() => expect(page.find('[role="menu"]').exists()).toBe(false))
    expect(document.activeElement).toBe(page.get('[aria-haspopup="menu"]').element)
    page.unmount()
  })
})
