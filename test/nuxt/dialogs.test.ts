import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import AppSheet from '~/components/AppSheet.vue'
import ConfirmModal from '~/components/ConfirmModal.vue'
import DateConfirmDialog from '~/components/DateConfirmDialog.vue'
import DateRescheduleDialog from '~/components/DateRescheduleDialog.vue'

// Sheets and dialogs are teleported to the body, so these tests query the document. Each test starts
// from an empty body, since teleported content can outlive the test that mounted it.
beforeEach(() => {
  document.body.innerHTML = ''
})
describe('AppSheet', () => {
  it('is a modal dialog with its title, and closes on Escape', async () => {
    const page = await mountSuspended(AppSheet, { props: { open: true, title: 'Host-Steuerung' } })

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.textContent).toContain('Host-Steuerung')

    await page.vm.$nextTick()
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(page.emitted('close')).toHaveLength(1)
  })

  it('renders nothing while closed', async () => {
    await mountSuspended(AppSheet, { props: { open: false, title: 'Host-Steuerung' } })

    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('ConfirmModal', () => {
  it('emits confirm from its button and cancel from Escape', async () => {
    const page = await mountSuspended(ConfirmModal, {
      props: { open: true, title: 'Termin festlegen?', confirmLabel: 'Festlegen' },
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()

    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Festlegen'))
    confirm?.click()
    expect(page.emitted('confirm')).toHaveLength(1)

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(page.emitted('cancel')).toHaveLength(1)
  })

  it('shows the cancel as a text link: no lift and no shadow, only an underline on hover', async () => {
    await mountSuspended(ConfirmModal, {
      props: { open: true, title: 'Termin festlegen?', confirmLabel: 'Festlegen' },
    })
    const cancel = [...(document.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Abbrechen'))!

    expect(cancel.className).toContain('hover:underline')
    expect(cancel.className).not.toContain('hover:-translate-y-0.5')
    expect(cancel.className).not.toContain('hover:shadow-card')
  })

  it('does not confirm twice while loading', async () => {
    const page = await mountSuspended(ConfirmModal, {
      props: { open: true, title: 'Termin festlegen?', confirmLabel: 'Festlegen', loading: true },
    })
    const confirm = [...(document.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])][0]
    confirm?.click()

    expect(page.emitted('confirm')).toBeUndefined()
  })
})

describe('DateConfirmDialog', () => {
  const options = Array.from({ length: 16 }, (_, index) => ({ id: `s${index + 1}`, day: `Tag ${index + 1}`, time: '20:00', yes: 1, maybe: 0, notes: [] }))

  it('checks the Slot the card opened it with, and a click moves the selection', async () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.dataset.slot ?? '')
    }
    const page = await mountSuspended(DateConfirmDialog, {
      props: { open: true, options, preselected: 's9', missingAfter: 0 },
      attachTo: document.body,
    })
    const radio = (id: string) => document.querySelector<HTMLElement>(`[data-slot="${id}"]`)!

    expect(radio('s9').getAttribute('aria-checked')).toBe('true')
    expect(radio('s9').className).toContain('border-focus')
    expect(radio('s9').className).not.toContain('outline-memphis')
    expect(radio('s1').getAttribute('aria-checked')).toBe('false')
    expect(scrolled).toEqual(['s9'])

    radio('s3').click()
    await page.vm.$nextTick()
    expect(radio('s3').getAttribute('aria-checked')).toBe('true')
    expect(radio('s9').getAttribute('aria-checked')).toBe('false')

    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button:not([role="radio"])')].find(button => button.textContent?.trim())
    confirm?.click()
    expect(page.emitted('confirm')).toEqual([['s3']])
    page.unmount()
  })

  it('keeps the buttons in the dialog with 16 Slots', async () => {
    const page = await mountSuspended(DateConfirmDialog, {
      props: { open: true, options, preselected: null, missingAfter: 2 },
      attachTo: document.body,
    })

    expect(document.querySelectorAll('[role="radio"]')).toHaveLength(16)
    expect(document.querySelectorAll('[role="dialog"] button:not([role="radio"])').length).toBeGreaterThanOrEqual(2)
    page.unmount()
  })
})

describe('DateRescheduleDialog', () => {
  it('closes only the calendar on Escape while its field is focused, and the second Escape closes the dialog', async () => {
    const page = await mountSuspended(DateRescheduleDialog, {
      props: { open: true, startsAt: '2090-10-30T18:30:00.000Z' },
      attachTo: document.body,
    })
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const input = dialog.querySelector<HTMLInputElement>('input[type="text"]')!

    input.focus()
    input.click()
    await flushPromises()
    expect(document.querySelector('[role="gridcell"]')).not.toBeNull()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[role="gridcell"]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(page.emitted('cancel')).toBeUndefined()
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('30.10.2090')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(page.emitted('cancel')).toHaveLength(1)
    page.unmount()
  })
})
