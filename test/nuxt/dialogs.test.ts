import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import AppSheet from '~/components/AppSheet.vue'
import ConfirmModal from '~/components/ConfirmModal.vue'

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

  it('does not confirm twice while loading', async () => {
    const page = await mountSuspended(ConfirmModal, {
      props: { open: true, title: 'Termin festlegen?', confirmLabel: 'Festlegen', loading: true },
    })
    const confirm = [...(document.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])][0]
    confirm?.click()

    expect(page.emitted('confirm')).toBeUndefined()
  })
})
