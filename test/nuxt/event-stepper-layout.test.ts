import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import EventStepper from '~/components/stepper/EventStepper.vue'
import { useStepperPill } from '~/composables/useStepperPill'

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
      expect(nav.text()).toContain('Neues Event')
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

    // The phone's Info button is the button's circle with a bare „?“ (#616); the desktop heading's icon is no button and keeps its circle.
    it('draws the Info button\'s „?“ without a circle, and keeps the circle on the desktop heading\'s icon', async () => {
      const page = await mountStepper({ infoTitle: 'Teams' }, { default: '<p>Formular</p>', info: '<p>Erklärung</p>' })

      expect(page.find('button[aria-label="Info"] svg').exists()).toBe(true)
      expect(page.find('button[aria-label="Info"] svg circle').exists()).toBe(false)
      expect(page.find('aside h2 svg circle').exists()).toBe(true)
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
      const page = await mountStepper({ nextBlocked: 'Gib dem Event einen Namen.' })

      const next = page.findAll('[data-testid="stepper-footer"] button').find(button => button.text().includes('Weiter'))!
      expect(next.attributes('aria-disabled')).toBe('true')
      expect(page.get(`[id="${next.attributes('aria-describedby')}"]`).text()).toBe('Gib dem Event einen Namen.')

      await next.trigger('click')
      expect(page.emitted('next')).toBeUndefined()
    })

    // The dock is a pill as wide as its buttons, fixed at the window's bottom on every step, so Weiter keeps one
    // place (#613). Geometry cannot be measured here: the markup that decides it is pinned.
    it('is a pill as wide as its buttons, in a box fixed at the window\'s bottom', async () => {
      const page = await mountStepper()

      const dock = page.get('[data-testid="stepper-footer"]')
      expect(dock.classes()).toEqual(expect.arrayContaining(['w-fit', 'rounded-pill']))
      expect(dock.classes()).not.toContain('w-full')
      const box = dock.element.parentElement!
      expect(box.className.split(' ')).toEqual(expect.arrayContaining(['fixed', 'bottom-4', 'layer-sticky']))
      expect(box.className.split(' ')).not.toContain('sticky')
    })

    it('anchors the box at the end of the form, in a zero-height row that pushes it to the form\'s right edge', async () => {
      const page = await mountStepper()

      const anchor = page.get('[data-testid="stepper-footer"]').element.parentElement!.parentElement!
      expect(anchor.parentElement).toBe(page.get('form').element)
      expect(page.get('form').element.lastElementChild).toBe(anchor)
      expect(anchor.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'h-0', 'justify-end']))
    })

    it.each([[0, false], [3, true]])('keeps the same fixed box on step %i, with Zurück only when there is a step before', async (current, hasBack) => {
      const page = await mountStepper({ current, reached: current })

      const dock = page.get('[data-testid="stepper-footer"]')
      expect(dock.element.parentElement!.className.split(' ')).toEqual(expect.arrayContaining(['fixed', 'bottom-4', 'layer-sticky']))
      const labels = dock.findAll('button').map(button => button.text())
      expect(labels[0]).toBe(hasBack ? 'Zurück' : 'Weiter')
      expect(labels.at(-1)).toBe('Weiter')
      expect(labels.includes('Zurück')).toBe(hasBack)
    })

    // 340 px info column + gap-4: a step without the info column keeps Weiter where it is on one with it (#613).
    it('insets the anchor by the info column\'s width and gap on a step without an info slot, not on one with it', async () => {
      const withInfo = await mountStepper({ infoTitle: 'Teams' }, { default: '<p>Formular</p>', info: '<p>Erklärung</p>' })
      const without = await mountStepper()

      const anchorOf = (page: typeof withInfo) => page.get('[data-testid="stepper-footer"]').element.parentElement!.parentElement!
      expect(anchorOf(withInfo).className.split(' ')).not.toContain('md:mr-[356px]')
      expect(anchorOf(without).className.split(' ')).toContain('md:mr-[356px]')
    })

    // The fixed pill covers the form's end: the form's content reserves its height plus a blocked reason of up to three lines.
    it('reserves the height of the fixed pill at the form\'s end', async () => {
      const page = await mountStepper()

      expect(page.get('form > div').classes()).toContain('pb-40')
    })

    // The page footer makes room for the pill while it is on screen (#701, PageFooter): the stepper counts itself in while mounted.
    it('tells the page footer about its pill while mounted, and not after', async () => {
      const { shown } = useStepperPill()
      expect(shown.value).toBe(false)

      const page = await mountStepper()
      expect(shown.value).toBe(true)

      page.unmount()
      mounted.splice(mounted.indexOf(page), 1)
      expect(shown.value).toBe(false)
    })

    it('keeps the blocker reason out of the dock, right above it, and still describes Weiter with it', async () => {
      const page = await mountStepper({ nextBlocked: 'Gib dem Event einen Namen.' })

      const dock = page.get('[data-testid="stepper-footer"]')
      const next = dock.findAll('button').find(button => button.text().includes('Weiter'))!
      const reason = page.get(`[id="${next.attributes('aria-describedby')}"]`)
      expect(reason.text()).toBe('Gib dem Event einen Namen.')
      // max-w-80: a fixed box shrinks to the window, not the form, so a long reason must not widen it past the form's left edge (#613).
      expect(reason.classes()).toEqual(expect.arrayContaining(['text-right', 'text-ink-2', 'max-w-80']))
      expect(reason.element.parentElement).toBe(dock.element.parentElement)
      expect(reason.element.parentElement!.className.split(' ')).toContain('fixed')
      expect(dock.element.contains(reason.element)).toBe(false)
      expect(dock.text()).not.toContain('Gib dem Event einen Namen.')
      expect(reason.element.compareDocumentPosition(dock.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('uses the label it is given for the last step', async () => {
      const page = await mountStepper({ current: 4, reached: 4, nextLabel: 'Event erstellen' })

      expect(page.get('[data-testid="stepper-footer"]').text()).toContain('Event erstellen')
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
