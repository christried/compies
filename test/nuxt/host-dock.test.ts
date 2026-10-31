import { mountSuspended } from '@nuxt/test-utils/runtime'
import { Crown } from '@lucide/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HostDock, { type DockAction } from '~/components/HostDock.vue'

function action(label: string, overrides: Partial<DockAction> = {}): DockAction {
  return { key: label, label, icon: Crown, group: 'Event', run: () => {}, ...overrides }
}

const pillLabels = (page: { element: Element }) =>
  [...page.element.querySelectorAll('[role="toolbar"] button')].map(button => button.textContent?.trim())

// Focus moves are only visible on an attached tree.
const mountAttached = (actions: DockAction[]) => mountSuspended(HostDock, { props: { actions }, attachTo: document.body })

describe('HostDock', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows up to three actions in the pill, and Mehr is there whenever there are actions (#164)', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('Termin festlegen'), action('Einladen'), action('Einstellungen')] } })

    expect(pillLabels(page)).toEqual(['Termin festlegen', 'Einladen', 'Einstellungen', 'Mehr'])
    page.unmount()
  })

  it('has no pill and no Mehr without any action', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [] } })

    expect(pillLabels(page)).toEqual([])
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

  it('on a phone, the crown opens one sheet with every action grouped, and the reason under a disabled one', async () => {
    const run = vi.fn()
    const page = await mountSuspended(HostDock, { props: { actions: [
      action('Termin festlegen', { group: 'Termine', primary: true, disabledReason: 'Noch kein Termin gewählt.', run }),
      action('Einladen', { group: 'Leute' }),
      action('Termine bearbeiten', { group: 'Termine', place: 'more' }),
      action('Einstellungen', { group: 'Event', place: 'more' }),
    ] }, attachTo: document.body })

    await page.get('button[aria-haspopup="dialog"]').trigger('click')

    const sheet = document.querySelector('[role="dialog"]')!
    expect(sheet.querySelector('h2')?.textContent).toContain('Host-Steuerung')
    expect([...sheet.querySelectorAll('[role="group"]')].map(group => group.getAttribute('aria-label'))).toEqual(['Termine', 'Leute', 'Event'])
    const buttons = [...sheet.querySelectorAll('button')].filter(button => button.textContent?.trim())
    expect(buttons.map(button => button.textContent?.trim())).toEqual([
      'Termin festlegen Noch kein Termin gewählt.',
      'Termine bearbeiten',
      'Einladen',
      'Einstellungen',
    ])
    expect(buttons[0]!.getAttribute('aria-disabled')).toBe('true')

    buttons[0]!.click()

    expect(run).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    page.unmount()
  })

  it('H focuses the first pill button, and the arrows move along the pill with Mehr at its end', async () => {
    const page = await mountAttached([action('A'), action('B'), action('C'), action('D', { place: 'more' })])
    const buttons = page.findAll('[role="toolbar"] button')

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    expect(document.activeElement).toBe(buttons[0]!.element)

    for (let step = 0; step < 3; step++) await buttons[step]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons[3]!.element)
    expect(buttons[3]!.attributes('aria-haspopup')).toBe('menu')

    await buttons[3]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons[0]!.element)
    page.unmount()
  })

  it('a disabled action still runs when clicked, so that its reason can be shown', async () => {
    const run = vi.fn()
    const page = await mountSuspended(HostDock, { props: { actions: [action('Termin festlegen', { disabledReason: 'Noch kein Termin.', run })] } })

    const button = page.get('[role="toolbar"] button')
    expect(button.attributes('aria-disabled')).toBe('true')
    await button.trigger('click')

    expect(run).toHaveBeenCalledOnce()
    page.unmount()
  })

  it('lists the Mehr menu as plain rows: the primary keeps no fill and no row is a bordered box', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('Session starten', { primary: true }), action('Einstellungen', { place: 'more' })] } })
    await page.get('[aria-haspopup="menu"]').trigger('click')

    for (const item of page.findAll('[role="menuitem"]')) {
      expect(item.classes()).not.toContain('bg-primary')
      expect(item.classes()).toContain('border-0')
      // outline-memphis sets a border later in the utilities layer and would bring the box back.
      expect(item.classes()).not.toContain('outline-memphis')
    }
    page.unmount()
  })

  it('says why a disabled primary is disabled in a bubble above the pill, linked with aria-describedby', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [
      action('Session 1 starten', { primary: true, disabledReason: 'Geht erst, wenn alle Teams gleich groß sind.' }),
      action('Einladen'),
    ] } })

    const button = page.findAll('[role="toolbar"] button')[0]!
    const bubble = page.get(`#${button.attributes('aria-describedby')}`)
    expect(bubble.text()).toBe('Geht erst, wenn alle Teams gleich groß sind.')
    expect(button.attributes('aria-disabled')).toBe('true')
    page.unmount()
  })

  it('shows no bubble when the primary can run', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('Session 1 starten', { primary: true }), action('Einladen')] } })

    expect(page.findAll('[role="toolbar"] button')[0]!.attributes('aria-describedby')).toBeUndefined()
    page.unmount()
  })

  it('runs a hold action only after the hold, from the pill, and keeps it out of Mehr', async () => {
    vi.useFakeTimers()
    const run = vi.fn(() => Promise.resolve(true))
    const page = await mountSuspended(HostDock, { props: { actions: [
      action('Session 1 beenden', { primary: true, hold: true, run }),
      action('Einladen'),
      action('Einstellungen', { place: 'more' }),
    ] } })
    const hold = page.findAll('[role="toolbar"] button').find(button => button.text().includes('Session 1 beenden'))!

    await hold.trigger('pointerdown')
    vi.advanceTimersByTime(900)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(run).toHaveBeenCalledOnce()

    await page.get('[aria-haspopup="menu"]').trigger('click')
    expect(page.findAll('[role="menuitem"]').map(item => item.text())).toEqual(['Einladen', 'Einstellungen'])
    vi.useRealTimers()
    page.unmount()
  })

  it('shows the hold hint as a badge inside the pill button, as tall as its siblings, with no line below (#164)', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('Session 1 beenden', { primary: true, hold: true }), action('Einladen')] } })

    const [hold, sibling] = page.findAll('[role="toolbar"] button')
    expect(hold!.text()).toBe('Session 1 beenden 1 s halten')
    expect(hold!.classes()).toContain('h-11')
    expect(sibling!.classes()).toContain('h-11')
    expect(page.get(`#${hold!.attributes('aria-describedby')}`).text()).toBe('1 Sekunde halten')
    // The only element with the full hint is the sr-only description, not a visible line.
    const hints = page.findAll('[role="toolbar"] span').filter(span => span.text() === '1 Sekunde halten')
    expect(hints.map(hint => hint.classes())).toEqual([expect.arrayContaining(['sr-only'])])
    page.unmount()
  })

  it('does not run a hold action on a plain click', async () => {
    const run = vi.fn(() => Promise.resolve(true))
    const page = await mountSuspended(HostDock, { props: { actions: [action('Session 1 beenden', { primary: true, hold: true, run })] } })

    await page.findAll('[role="toolbar"] button')[0]!.trigger('click')

    expect(run).not.toHaveBeenCalled()
    page.unmount()
  })

  it('on a phone, the sheet holds the hold action too', async () => {
    vi.useFakeTimers()
    const run = vi.fn(() => Promise.resolve(true))
    const page = await mountSuspended(HostDock, { props: { actions: [action('Session 1 beenden', { primary: true, hold: true, run })] }, attachTo: document.body })

    await page.get('button[aria-haspopup="dialog"]').trigger('click')
    const sheet = document.querySelector('[role="dialog"]')!
    const hold = [...sheet.querySelectorAll('button')].find(button => button.textContent?.includes('Session 1 beenden'))!
    hold.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(1000)

    expect(run).toHaveBeenCalledOnce()
    vi.useRealTimers()
    page.unmount()
  })

  it('on a phone, the hold action is a full width row with the badge at its end and no line below (#164)', async () => {
    const page = await mountSuspended(HostDock, { props: { actions: [action('Session 1 beenden', { primary: true, hold: true })] }, attachTo: document.body })

    await page.get('button[aria-haspopup="dialog"]').trigger('click')
    const sheet = document.querySelector('[role="dialog"]')!
    const hold = [...sheet.querySelectorAll('button')].find(button => button.textContent?.includes('Session 1 beenden'))!
    expect(hold.textContent?.replace(/\s+/g, ' ').trim()).toBe('Session 1 beenden 1 s halten')
    expect(hold.classList).toContain('w-full')
    const badge = [...hold.querySelectorAll('[aria-hidden="true"]')].find(element => element.textContent === '1 s halten')
    expect(badge?.classList).toContain('ml-auto')
    const description = sheet.querySelector(`#${hold.getAttribute('aria-describedby')}`)!
    expect(description.textContent).toBe('1 Sekunde halten')
    expect(description.classList).toContain('sr-only')
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
