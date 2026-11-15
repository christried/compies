import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '~/components/AppShell.vue'
import SettingsCard from '~/components/SettingsCard.vue'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// The header's Appearance button (#617, 15-header-eventseite § AppHeader): from md up a signed-in User picks Hell, Dunkel or System
// from a menu next to Ton. jsdom applies no CSS, so the breakpoint is asserted on the wrapper's `max-md:hidden`.

const BUTTON = 'button[aria-label="Darstellung"]'
const TOAST = 'Das hat nicht geklappt, die Darstellung ist wieder wie vorher. Versuch’s nochmal.'

async function mountHeader() {
  const page = await mountSuspended(AppShell, { props: { kind: 'hub' }, route: '/', attachTo: document.body })
  return { page, header: page.get('header') }
}

type Header = Awaited<ReturnType<typeof mountHeader>>

const items = (h: Header) => h.header.findAll('[role="menuitemradio"]')
const ticked = (h: Header) => items(h).filter(item => item.attributes('aria-checked') === 'true').map(item => item.text())

/**
 * An endpoint that records what it receives and answers once `release()` is called (at once, when never held). `settled()` waits until
 * every request it got is answered and the page has taken the answer, so no save is still on its way when the next test registers its own.
 */
function recordingEndpoint(hold = false) {
  const received: unknown[] = []
  let answered = 0
  let release!: () => void
  const gate = hold
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : Promise.resolve()
  registerEndpoint('/api/me/appearance', {
    method: 'POST',
    handler: async (event) => {
      const { appearance } = await readBody(event)
      received.push(appearance)
      await gate
      answered++
      return { appearance }
    },
  })
  return {
    received,
    release: () => release(),
    settled: async () => {
      await vi.waitFor(() => expect(answered).toBe(received.length))
      // The page takes the answer a few ticks later; a save still open when the next test resets the User would send again.
      await new Promise(resolve => setTimeout(resolve, 50))
    },
  }
}

function failingEndpoint() {
  registerEndpoint('/api/me/appearance', {
    method: 'POST',
    handler: () => {
      throw createError({ statusCode: 500 })
    },
  })
}

describe('the Appearance button in the header', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('sits left of Ton, in a wrapper that is hidden below md', async () => {
    const { header, page } = await mountHeader()

    const button = header.get(BUTTON)
    expect(button.element.parentElement!.classList).toContain('max-md:hidden')
    const sound = header.get('button[aria-label="Ton"]')
    expect(button.element.compareDocumentPosition(sound.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    page.unmount()
  })

  it('is absent when signed out, and so is any radio group in the header', async () => {
    signInAs(null)

    const { header, page } = await mountHeader()

    expect(header.find(BUTTON).exists()).toBe(false)
    expect(header.find('[role="radiogroup"]').exists()).toBe(false)
    page.unmount()
  })

  it.each([['light', 'lucide-sun'], ['dark', 'lucide-moon'], ['system', 'lucide-monitor']] as const)(
    'shows the icon of the Appearance %s',
    async (appearance, icon) => {
      signInAs({ ...kitty, appearance })

      const { header, page } = await mountHeader()

      expect(header.get(`${BUTTON} svg`).classes()).toContain(icon)
      page.unmount()
    },
  )

  it('follows a change of the Appearance', async () => {
    const { header, page } = await mountHeader()
    expect(header.get(`${BUTTON} svg`).classes()).toContain('lucide-sun')

    useAuthUser().value = { ...kitty, appearance: 'dark' }
    await flushPromises()

    expect(header.get(`${BUTTON} svg`).classes()).toContain('lucide-moon')
    page.unmount()
  })

  it.each([['light', 'Hell'], ['system', 'System']] as const)('opens a menu with the three choices and %s ticked', async (appearance, label) => {
    signInAs({ ...kitty, appearance })
    const h = await mountHeader()

    await h.header.get(BUTTON).trigger('click')

    const menu = h.header.get('[role="menu"]')
    expect(menu.attributes('aria-label')).toBe('Darstellung')
    expect(items(h).map(item => item.text())).toEqual(['Hell', 'Dunkel', 'System'])
    expect(items(h).map(item => item.attributes('aria-checked'))).toEqual(
      ['Hell', 'Dunkel', 'System'].map(name => String(name === label)),
    )
    expect(h.header.get(BUTTON).attributes('aria-expanded')).toBe('true')
    expect(h.header.get(BUTTON).attributes('aria-pressed')).toBeUndefined()
    h.page.unmount()
  })

  it('applies a choice at once, closes the menu, gives the focus back and shows no toast', async () => {
    const endpoint = recordingEndpoint(true)
    const h = await mountHeader()
    await h.header.get(BUTTON).trigger('click')

    await items(h)[1]!.trigger('click')

    await vi.waitFor(() => expect(endpoint.received).toEqual(['dark']))
    expect(useAuthUser().value?.appearance).toBe('dark')
    expect(h.header.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(h.header.get(BUTTON).element)
    endpoint.release()
    await endpoint.settled()
    expect(shownToasts()).toEqual([])
    h.page.unmount()
  })

  it('sends nothing for the ticked choice, and just closes the menu', async () => {
    const endpoint = recordingEndpoint()
    const h = await mountHeader()
    await h.header.get(BUTTON).trigger('click')

    await items(h)[0]!.trigger('click')

    await flushPromises()
    expect(endpoint.received).toEqual([])
    expect(h.header.find('[role="menu"]').exists()).toBe(false)
    h.page.unmount()
  })

  it('closes on Esc with the focus back on the button, and on an outside pointerdown', async () => {
    const h = await mountHeader()
    await h.header.get(BUTTON).trigger('click')

    await h.header.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
    expect(h.header.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(h.header.get(BUTTON).element)

    await h.header.get(BUTTON).trigger('click')
    expect(h.header.find('[role="menu"]').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(h.header.find('[role="menu"]').exists()).toBe(false)
    h.page.unmount()
  })

  it('opens on the ticked item and walks the three with the arrow keys, wrapping', async () => {
    signInAs({ ...kitty, appearance: 'dark' })
    const h = await mountHeader()
    await h.header.get(BUTTON).trigger('click')
    expect(document.activeElement).toBe(items(h)[1]!.element)

    await items(h)[1]!.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items(h)[2]!.element)
    await items(h)[2]!.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items(h)[0]!.element)
    await items(h)[0]!.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items(h)[2]!.element)
    h.page.unmount()
  })

  it('switches back, closes the menu and says so in a toast when the save fails', async () => {
    failingEndpoint()
    const h = await mountHeader()
    await h.header.get(BUTTON).trigger('click')

    await items(h)[1]!.trigger('click')

    await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
    expect(shownToasts()[0]).toMatchObject({ tone: 'error', text: TOAST })
    expect(useAuthUser().value?.appearance).toBe('light')
    expect(h.header.find('[role="menu"]').exists()).toBe(false)
    h.page.unmount()
  })

  it('sends quick taps as the Profil page does: the newest only once the first is back', async () => {
    const endpoint = recordingEndpoint(true)
    const h = await mountHeader()
    await h.header.get(BUTTON).trigger('click')
    await items(h)[1]!.trigger('click')
    await vi.waitFor(() => expect(endpoint.received).toEqual(['dark']))
    await h.header.get(BUTTON).trigger('click')

    await items(h)[2]!.trigger('click')

    expect(useAuthUser().value?.appearance).toBe('system')
    expect(endpoint.received).toEqual(['dark'])
    endpoint.release()
    await vi.waitFor(() => expect(endpoint.received.at(-1)).toBe('system'))
    await endpoint.settled()
    h.page.unmount()
  })

  describe('and the Profil page\'s row', () => {
    const cardTicked = (card: Pick<VueWrapper, 'findAll'>) =>
      card.findAll('[role="radio"]').filter(r => r.attributes('aria-checked') === 'true').map(r => r.text())

    it('shows a choice made in the menu without a reload', async () => {
      const endpoint = recordingEndpoint()
      const card = await mountSuspended(SettingsCard)
      const h = await mountHeader()
      await h.header.get(BUTTON).trigger('click')

      await items(h)[1]!.trigger('click')

      await endpoint.settled()
      expect(cardTicked(card)).toEqual(['Dunkel'])
      expect(ticked(h)).toEqual([])
      card.unmount()
      h.page.unmount()
    })

    it('shows Hell again after a failed save, and the card has no notice of its own', async () => {
      failingEndpoint()
      const card = await mountSuspended(SettingsCard)
      const h = await mountHeader()
      await h.header.get(BUTTON).trigger('click')

      await items(h)[1]!.trigger('click')

      await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
      await flushPromises()
      expect(cardTicked(card)).toEqual(['Hell'])
      expect(card.find('[role="alert"]').exists()).toBe(false)
      card.unmount()
      h.page.unmount()
    })
  })
})
