import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsCard from '~/components/SettingsCard.vue'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// The Profil card's Rundgang row (#649, GLOSSARY: Tour): the button sets the User's stored Tour version back to 0 and says so.
// Only the texts, roles, toast list and the User's stored number are checked, never that a function was called.

const TITLE = 'Rundgang'
const DESCRIPTION = 'Zeigt dir die Event-Seite noch einmal.'
const BUTTON = 'Wiederholen'
const DONE = 'Der Rundgang startet beim nächsten Event, das du nicht hostest.'
const FAILED = 'Das hat nicht geklappt, der Rundgang ist wie vorher. Versuch’s nochmal.'

function resetButton(card: VueWrapper) {
  return card.findAll('button').find(button => button.text() === BUTTON)!
}

describe('the Rundgang row on the Profil card', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the row with its description, and the button is described by that description', async () => {
    const card = await mountSuspended(SettingsCard)

    expect(card.text()).toContain(TITLE)
    const button = resetButton(card)
    const describedBy = button.attributes('aria-describedby')!
    expect(describedBy).toBeTruthy()
    expect(card.get(`[id="${describedBy}"]`).text()).toBe(DESCRIPTION)
    card.unmount()
  })

  it('resets the Tour and shows the success toast', async () => {
    registerEndpoint('/api/me/tour-reset', { method: 'POST', handler: () => ({ tourSeen: 0 }) })
    const card = await mountSuspended(SettingsCard)

    await resetButton(card).trigger('click')

    await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
    expect(shownToasts()[0]).toMatchObject({ tone: 'success', text: DONE })
    expect(useAuthUser().value?.tourSeen).toBe(0)
    expect(card.find('[role="alert"]').exists()).toBe(false)
    card.unmount()
  })

  it('shows the notice, no toast, and keeps the stored number when the reset fails', async () => {
    registerEndpoint('/api/me/tour-reset', {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 500 })
      },
    })
    const card = await mountSuspended(SettingsCard)

    await resetButton(card).trigger('click')

    await vi.waitFor(() => expect(card.find('[role="alert"]').text()).toBe(FAILED))
    await flushPromises()
    expect(shownToasts()).toEqual([])
    expect(useAuthUser().value?.tourSeen).toBe(kitty.tourSeen)
    expect(resetButton(card).attributes('aria-disabled')).toBeUndefined()
    card.unmount()
  })

  it('is aria-disabled, not disabled, and keeps the focus while the reset is on its way; a second click sends nothing (#785)', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let requests = 0
    registerEndpoint('/api/me/tour-reset', {
      method: 'POST',
      handler: async () => {
        requests += 1
        await gate
        return { tourSeen: 0 }
      },
    })
    const card = await mountSuspended(SettingsCard, { attachTo: document.body })

    resetButton(card).element.focus()
    await resetButton(card).trigger('click')
    await vi.waitFor(() => expect(resetButton(card).attributes('aria-disabled')).toBe('true'))
    expect(resetButton(card).attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(resetButton(card).element)

    await resetButton(card).trigger('click')
    expect(requests).toBe(1)

    release()
    await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
    expect(shownToasts()[0]).toMatchObject({ tone: 'success', text: DONE })
    expect(resetButton(card).attributes('aria-disabled')).toBeUndefined()
    expect(requests).toBe(1)
    card.unmount()
  })
})
