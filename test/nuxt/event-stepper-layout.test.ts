import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import EventStepper from '~/components/stepper/EventStepper.vue'

// The stepper's layout (#144): step list on desktop, progress bar, sticky footer and info sheet on phones. Both
// layouts are in the markup; CSS shows one of them, so the tests read each by its own landmark.

const steps = [
  { key: 'name', label: 'Name' },
  { key: 'format', label: 'Format' },
  { key: 'games', label: 'Spiele' },
  { key: 'points', label: 'Punkte' },
  { key: 'sessions', label: 'Termin' },
]

// Attached to the document: a submit button only submits a form that is in it, and focus needs it too.
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach(page => page.unmount())
})

async function mountStepper(props: Record<string, unknown> = {}, slots: Record<string, string> = { default: '<p>Formular</p>' }) {
  const page = await mountSuspended(EventStepper, {
    props: { steps, current: 1, reached: 2, nextLabel: 'Weiter', nextBlocked: null, title: 'Wer gegen wen?', ...props },
    slots,
    attachTo: document.body,
  })
  mounted.push(page)
  return page
}

describe('EventStepper', () => {
  it('shows the kicker „Schritt n von N“ with the step count taken from the steps, and the title', async () => {
    const page = await mountStepper()

    expect(page.get('h1').text()).toContain('Schritt 2 von 5')
    expect(page.get('h1').text()).toContain('Wer gegen wen?')
    expect(page.text()).toContain('Formular')

    const longer = await mountStepper({ steps: [...steps, { key: 'mode', label: 'Modus' }, { key: 'pool', label: 'Pool' }, { key: 'tie', label: 'Tiebreaker' }] })
    expect(longer.get('h1').text()).toContain('Schritt 2 von 8')
  })

  describe('on desktop', () => {
    it('lists the steps in a nav, the current one marked aria-current="step"', async () => {
      const page = await mountStepper()

      const nav = page.get('nav[aria-label="Schritte"]')
      expect(nav.text()).toContain('Neue Session')
      const items = nav.findAll('li')
      expect(items).toHaveLength(5)
      expect(items.map(item => item.attributes('aria-current'))).toEqual([undefined, 'step', undefined, undefined, undefined])
    })

    it('marks finished steps with a check and makes only those buttons', async () => {
      const page = await mountStepper({ current: 3, reached: 3 })

      const items = page.get('nav[aria-label="Schritte"]').findAll('li')
      expect(items.map(item => item.find('button').exists())).toEqual([true, true, true, false, false])
      expect(items.map(item => item.text())).toEqual(['✓ Name', '✓ Format', '✓ Spiele', '4 Punkte', '5 Termin'])
    })

    it('goes to a finished step when it is clicked', async () => {
      const page = await mountStepper({ current: 3, reached: 3 })

      await page.get('nav[aria-label="Schritte"]').findAll('li')[1]!.get('button').trigger('click')

      expect(page.emitted('go')).toEqual([[1]])
    })

    it('keeps the steps up to the one reached clickable when the Host went back', async () => {
      const page = await mountStepper({ current: 1, reached: 3 })

      const items = page.get('nav[aria-label="Schritte"]').findAll('li')
      expect(items.map(item => item.find('button').exists())).toEqual([true, false, true, true, false])
    })

    it('shows the info slot as a column beside the form, and none without it', async () => {
      const withInfo = await mountStepper({ infoTitle: 'Teams' }, { default: '<p>Formular</p>', info: '<p>Erklärung</p>' })
      expect(withInfo.get('aside[aria-label="Erklärung"]').text()).toContain('Erklärung')

      const without = await mountStepper()
      expect(without.find('aside').exists()).toBe(false)
    })
  })

  describe('on phones', () => {
    it('shows a progress bar with one segment per step, for the eye only', async () => {
      const page = await mountStepper()

      const bar = page.get('[data-testid="progress"]')
      expect(bar.attributes('aria-hidden')).toBe('true')
      expect(bar.findAll('span')).toHaveLength(5)
    })

    it('has a footer with Zurück and Weiter', async () => {
      const page = await mountStepper()

      const footer = page.get('[data-testid="stepper-footer"]')
      expect(footer.text()).toContain('Zurück')
      expect(footer.text()).toContain('Weiter')

      await footer.findAll('button').find(button => button.text().includes('Zurück'))!.trigger('click')
      await footer.findAll('button').find(button => button.text().includes('Weiter'))!.trigger('click')
      expect(page.emitted('back')).toHaveLength(1)
      expect(page.emitted('next')).toHaveLength(1)
    })

    it('opens the info in a sheet behind the Info button', async () => {
      const page = await mountStepper({ infoTitle: 'Teams' }, { default: '<p>Formular</p>', info: '<p>Erklärung</p>' })
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()

      await page.get('button[aria-label="Info"]').trigger('click')

      const dialog = document.body.querySelector('[role="dialog"]')
      expect(dialog?.textContent).toContain('Teams')
      expect(dialog?.textContent).toContain('Erklärung')
    })

    it('has no Info button without an info slot', async () => {
      const page = await mountStepper()

      expect(page.find('button[aria-label="Info"]').exists()).toBe(false)
    })
  })

  describe('the footer', () => {
    it('has no Zurück on the first step', async () => {
      const page = await mountStepper({ current: 0, reached: 0 })

      expect(page.get('[data-testid="stepper-footer"]').text()).not.toContain('Zurück')
    })

    it('blocks Weiter with aria-disabled and shows the reason, and does not go on', async () => {
      const page = await mountStepper({ nextBlocked: 'Gib der Session einen Namen.' })

      const next = page.findAll('[data-testid="stepper-footer"] button').find(button => button.text().includes('Weiter'))!
      expect(next.attributes('aria-disabled')).toBe('true')
      expect(page.get(`[id="${next.attributes('aria-describedby')}"]`).text()).toBe('Gib der Session einen Namen.')

      await next.trigger('click')
      expect(page.emitted('next')).toBeUndefined()
    })

    // The dock is a pill as wide as its buttons, at the bottom right on every screen, not a full-width bar (#174).
    it('is a dock as wide as its buttons, sticky at the bottom right', async () => {
      const page = await mountStepper()

      const dock = page.get('[data-testid="stepper-footer"]')
      expect(dock.classes()).toEqual(expect.arrayContaining(['w-fit', 'ml-auto', 'rounded-pill']))
      expect(dock.classes()).not.toContain('w-full')
      expect(dock.classes()).not.toContain('-mx-3.5')
      const column = dock.element.parentElement!
      expect(column.className).toContain('sticky')
      expect(column.className).toContain('layer-sticky')
    })

    it('keeps the blocker reason out of the dock, right above it, and still describes Weiter with it', async () => {
      const page = await mountStepper({ nextBlocked: 'Gib der Session einen Namen.' })

      const dock = page.get('[data-testid="stepper-footer"]')
      const next = dock.findAll('button').find(button => button.text().includes('Weiter'))!
      const reason = page.get(`[id="${next.attributes('aria-describedby')}"]`)
      expect(reason.text()).toBe('Gib der Session einen Namen.')
      expect(reason.classes()).toEqual(expect.arrayContaining(['text-right', 'text-ink-2']))
      expect(dock.element.contains(reason.element)).toBe(false)
      expect(dock.text()).not.toContain('Gib der Session einen Namen.')
      expect(reason.element.compareDocumentPosition(dock.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('uses the label it is given for the last step', async () => {
      const page = await mountStepper({ current: 4, reached: 4, nextLabel: 'Session erstellen' })

      expect(page.get('[data-testid="stepper-footer"]').text()).toContain('Session erstellen')
    })
  })

  it('moves the focus to the heading when the step changes, not when it first shows', async () => {
    const page = await mountStepper({ reached: 1 }, { default: '<input aria-label="Feld">' })
    expect(document.activeElement).not.toBe(page.get('h1').element)

    await page.setProps({ current: 2, title: 'Wie viele Spiele?' })
    await new Promise(resolve => setTimeout(resolve))

    expect(document.activeElement).toBe(page.get('h1').element)
  })
})
