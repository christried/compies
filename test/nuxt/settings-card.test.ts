import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
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

// The row „Weniger Bewegung“ (#680, GLOSSARY: Reduced motion): the device's switch, the second row, between Ton and Darstellung. It shows what
// is stored in the cookie `compies-motion` (a change shows at once, then the route saves it), not whether the page is calm.
describe('the Weniger Bewegung row on the Profil card', () => {
  const MOTION_TITLE = 'Weniger Bewegung'
  const MOTION_DESCRIPTION = 'Ruhige Varianten der großen Animationen, nur auf diesem Gerät. Die Einstellung deines Geräts zählt immer mit.'
  const MOTION_FAILED = 'Das hat nicht geklappt, „Weniger Bewegung“ ist wieder wie vorher. Versuch’s nochmal.'

  const motionSwitch = (card: VueWrapper) => card.findAll('[role="switch"]')[1]!
  const calm = () => document.documentElement.getAttribute('data-motion')

  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    useState('motion-choice').value = null
    useState('motion-save').value = { saved: false, sending: false, failed: false }
  })
  afterEach(async () => {
    document.body.innerHTML = ''
    // A save still on its way would meet the next case's choice (the loop sends the newest): let it end first.
    await vi.waitFor(() => expect(useState<{ sending: boolean }>('motion-save').value.sending).toBe(false))
    await cookieStore.delete('compies-motion')
    vi.restoreAllMocks()
  })

  it('is the second row, between Ton and Darstellung', async () => {
    const card = await mountSuspended(SettingsCard)

    expect(card.findAll('b[id$="-title"]').map(title => title.text())).toEqual(['Ton', MOTION_TITLE, 'Darstellung', 'Rundgang'])
    card.unmount()
  })

  it('has a switch named by the title and described by the text', async () => {
    const card = await mountSuspended(SettingsCard)

    const toggle = motionSwitch(card)
    expect(card.get(`[id="${toggle.attributes('aria-labelledby')}"]`).text()).toBe(MOTION_TITLE)
    expect(card.get(`[id="${toggle.attributes('aria-describedby')}"]`).text()).toBe(MOTION_DESCRIPTION)
    card.unmount()
  })

  it('is off by default, and the page is not calm', async () => {
    const card = await mountSuspended(SettingsCard)

    expect(motionSwitch(card).attributes('aria-checked')).toBe('false')
    expect(calm()).toBeNull()
    card.unmount()
  })

  it('is on when the device has the cookie', async () => {
    await cookieStore.set('compies-motion', 'reduced')

    const card = await mountSuspended(SettingsCard)

    await vi.waitFor(() => expect(motionSwitch(card).attributes('aria-checked')).toBe('true'))
    card.unmount()
  })

  it('shows what is stored, not whether the page is calm: off and usable although the device asks for less motion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }))
    let answered = 0
    registerEndpoint('/api/me/motion', {
      method: 'POST',
      handler: () => {
        answered += 1
        return { reduced: true }
      },
    })
    const card = await mountSuspended(SettingsCard)

    expect(motionSwitch(card).attributes('aria-checked')).toBe('false')
    expect(motionSwitch(card).attributes('aria-disabled')).toBeUndefined()
    await motionSwitch(card).trigger('click')
    expect(motionSwitch(card).attributes('aria-checked')).toBe('true')
    await vi.waitFor(() => expect(answered).toBe(1))
    await flushPromises()
    card.unmount()
  })

  it('shows a change at once, makes the page calm, and then saves it', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const bodies: unknown[] = []
    registerEndpoint('/api/me/motion', {
      method: 'POST',
      handler: async (event) => {
        bodies.push(await readBody(event))
        await gate
        return { reduced: true }
      },
    })
    const card = await mountSuspended(SettingsCard)

    await motionSwitch(card).trigger('click')

    expect(motionSwitch(card).attributes('aria-checked')).toBe('true')
    await vi.waitFor(() => expect(calm()).toBe('reduced'))
    await vi.waitFor(() => expect(bodies).toEqual([{ reduced: true }]))
    release()
    await flushPromises()
    expect(motionSwitch(card).attributes('aria-checked')).toBe('true')
    expect(card.find('[role="alert"]').exists()).toBe(false)
    card.unmount()
  })

  it('switches off with the full motion back when it is switched off again', async () => {
    const bodies: unknown[] = []
    registerEndpoint('/api/me/motion', {
      method: 'POST',
      handler: async (event) => {
        const body = await readBody(event)
        bodies.push(body)
        return body
      },
    })
    await cookieStore.set('compies-motion', 'reduced')
    const card = await mountSuspended(SettingsCard)
    await vi.waitFor(() => expect(motionSwitch(card).attributes('aria-checked')).toBe('true'))

    await motionSwitch(card).trigger('click')

    expect(motionSwitch(card).attributes('aria-checked')).toBe('false')
    await vi.waitFor(() => expect(calm()).toBeNull())
    await vi.waitFor(() => expect(bodies).toEqual([{ reduced: false }]))
    card.unmount()
  })

  it('sends only the newest of quick taps once the first save is back', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const bodies: { reduced: boolean }[] = []
    registerEndpoint('/api/me/motion', {
      method: 'POST',
      handler: async (event) => {
        const body = await readBody<{ reduced: boolean }>(event)
        bodies.push(body)
        if (bodies.length === 1) await gate
        return body
      },
    })
    const card = await mountSuspended(SettingsCard)

    await motionSwitch(card).trigger('click')
    await vi.waitFor(() => expect(bodies).toHaveLength(1))
    await motionSwitch(card).trigger('click')
    expect(motionSwitch(card).attributes('aria-checked')).toBe('false')
    release()

    await vi.waitFor(() => expect(bodies).toEqual([{ reduced: true }, { reduced: false }]))
    await flushPromises()
    expect(motionSwitch(card).attributes('aria-checked')).toBe('false')
    card.unmount()
  })

  it('switches back and shows the notice, no toast, when the save fails', async () => {
    registerEndpoint('/api/me/motion', {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 500 })
      },
    })
    const card = await mountSuspended(SettingsCard)

    await motionSwitch(card).trigger('click')

    await vi.waitFor(() => expect(card.find('[role="alert"]').text()).toBe(MOTION_FAILED))
    expect(motionSwitch(card).attributes('aria-checked')).toBe('false')
    expect(calm()).toBeNull()
    expect(shownToasts()).toEqual([])
    card.unmount()
  })

  it('takes the notice away with the next change', async () => {
    let fail = true
    registerEndpoint('/api/me/motion', {
      method: 'POST',
      handler: async (event) => {
        if (fail) throw createError({ statusCode: 500 })
        return await readBody(event)
      },
    })
    const card = await mountSuspended(SettingsCard)
    await motionSwitch(card).trigger('click')
    await vi.waitFor(() => expect(card.find('[role="alert"]').exists()).toBe(true))

    fail = false
    await motionSwitch(card).trigger('click')

    await vi.waitFor(() => expect(card.find('[role="alert"]').exists()).toBe(false))
    expect(motionSwitch(card).attributes('aria-checked')).toBe('true')
    card.unmount()
  })
})
