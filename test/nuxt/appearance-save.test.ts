import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '~/components/AppShell.vue'
import SettingsCard from '~/components/SettingsCard.vue'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// One save state for the Appearance, however many controls show it (#657): on the Profil page the header's menu and the card's row
// are mounted at once, and two quick choices in two of them must reach the server in order, the newest last.

const BUTTON = 'button[aria-label="Darstellung"]'

/**
 * An endpoint that records what it receives. The first request waits for `release()`; it is answered with an error when `failFirst`,
 * every later one at once. `settled()` waits until the page has taken every answer, so no save leaks into the next test.
 */
function heldEndpoint({ failFirst = false } = {}) {
  const received: unknown[] = []
  let answered = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  registerEndpoint('/api/me/appearance', {
    method: 'POST',
    handler: async (event) => {
      const { appearance } = await readBody(event)
      const first = received.push(appearance) === 1
      if (first) await gate
      answered++
      if (first && failFirst) throw createError({ statusCode: 500 })
      return { appearance }
    },
  })
  return {
    received,
    release: () => release(),
    settled: async () => {
      await vi.waitFor(() => expect(answered).toBe(received.length))
      await new Promise(resolve => setTimeout(resolve, 50))
    },
  }
}

describe('two Appearance controls on one page', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function mountBoth() {
    const card = await mountSuspended(SettingsCard)
    const page = await mountSuspended(AppShell, { props: { kind: 'hub' }, route: '/', attachTo: document.body })
    const header = page.get('header')
    const pickInHeader = async (label: string) => {
      await header.get(BUTTON).trigger('click')
      await header.findAll('[role="menuitemradio"]').find(item => item.text() === label)!.trigger('click')
    }
    const pickInCard = (label: string) => card.findAll('[role="radio"]').find(r => r.text() === label)!.trigger('click')
    const cardTicked = () => card.findAll('[role="radio"]').filter(r => r.attributes('aria-checked') === 'true').map(r => r.text())
    return { card, page, pickInHeader, pickInCard, cardTicked }
  }

  it('sends the newest choice last and shows it, though the first save is still open', async () => {
    const endpoint = heldEndpoint()
    const c = await mountBoth()

    await c.pickInHeader('Dunkel')
    await vi.waitFor(() => expect(endpoint.received).toEqual(['dark']))
    await c.pickInCard('System')

    expect(c.cardTicked()).toEqual(['System'])
    expect(endpoint.received).toEqual(['dark'])
    endpoint.release()
    await vi.waitFor(() => expect(endpoint.received).toEqual(['dark', 'system']))
    await endpoint.settled()
    expect(useAuthUser().value?.appearance).toBe('system')
    expect(c.cardTicked()).toEqual(['System'])
    c.card.unmount()
    c.page.unmount()
  })

  it('keeps and sends the newest choice when the first save fails', async () => {
    const endpoint = heldEndpoint({ failFirst: true })
    const c = await mountBoth()

    await c.pickInCard('Dunkel')
    await vi.waitFor(() => expect(endpoint.received).toEqual(['dark']))
    await c.pickInHeader('System')
    endpoint.release()

    await vi.waitFor(() => expect(endpoint.received).toEqual(['dark', 'system']))
    await endpoint.settled()
    await flushPromises()
    expect(useAuthUser().value?.appearance).toBe('system')
    expect(c.cardTicked()).toEqual(['System'])
    expect(shownToasts()).toEqual([])
    c.card.unmount()
    c.page.unmount()
  })
})
