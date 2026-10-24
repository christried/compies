import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CatchAllPage from '~/pages/[...path].vue'
import { kitty, signInAs } from './auth'

// The Home list the construction CTA reads (#12). Each test sets the Events it returns.
let homeEvents: unknown[] = []
registerEndpoint('/api/e', { method: 'GET', handler: () => ({ events: homeEvents }) })

async function visit(route: string) {
  return mountSuspended(CatchAllPage, { route })
}

describe('construction page route guard', () => {
  beforeEach(async () => {
    signInAs(kitty)
    homeEvents = []
    await clearNuxtData('home-events')
  })

  it('links the call to action to the latest open poll when the User has one', async () => {
    homeEvents = [
      { slug: 'freitags-zocken-k7q2', name: 'Freitags-Zocken', phase: 'poll', createdAt: '2026-10-20T10:00:00.000Z' },
    ]
    const page = await visit('/archiv')

    await vi.waitFor(() => {
      const cta = page.findAll('main a').find(link => link.text().includes('Zur Terminumfrage'))
      expect(cta?.attributes('href')).toBe('/e/freitags-zocken-k7q2')
    })
  })

  it('picks the most recently created open poll, not the first one on Home', async () => {
    // Home lists polls to vote on first, so an older poll can come before a newer one.
    homeEvents = [
      { slug: 'alt-a1b2', name: 'Alt', phase: 'poll', createdAt: '2026-10-01T10:00:00.000Z' },
      { slug: 'abend-c3d4', name: 'Abend', phase: 'date_set', createdAt: '2026-10-21T10:00:00.000Z' },
      { slug: 'neu-e5f6', name: 'Neu', phase: 'poll', createdAt: '2026-10-20T10:00:00.000Z' },
    ]
    const page = await visit('/archiv')

    await vi.waitFor(() => {
      const cta = page.findAll('main a').find(link => link.text().includes('Zur Terminumfrage'))
      expect(cta?.attributes('href')).toBe('/e/neu-e5f6')
    })
  })

  it('renders the Archiv state with its own title in the hub shell', async () => {
    const page = await visit('/archiv')

    expect(page.get('h1').text()).toBe('Das Archiv wird noch gemauert.')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(true)
  })

  it('renders the Profil state, and the Bibliothek state for a Host', async () => {
    expect((await visit('/profil')).get('h1').text()).toBe('Profil? Der Bagger ist bestellt.')

    signInAs({ ...kitty, canHost: true })
    expect((await visit('/bibliothek')).get('h1').text()).toBe('Die Bibliothek ist noch eingerüstet.')
  })

  it('renders the generic state for Bibliothek without the Host permission', async () => {
    const page = await visit('/bibliothek')

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
    expect(page.find('nav[aria-label="Hauptnavigation"] a').exists()).toBe(true)
    expect(page.findAll('nav[aria-label="Hauptnavigation"] a').some(a => a.text() === 'Bibliothek')).toBe(false)
  })

  it('renders the generic state for Admin to anyone but the Platform admin', async () => {
    expect((await visit('/admin')).get('h1').text()).toBe('Hier wird noch gebaut.')

    signInAs({ ...kitty, canHost: true })
    expect((await visit('/admin')).get('h1').text()).toBe('Hier wird noch gebaut.')
  })

  it('renders the Admin state for the Platform admin, with the Bibliothek nav item', async () => {
    signInAs({ ...kitty, isAdmin: true })
    const page = await visit('/admin')

    expect(page.get('h1').text()).toBe('Der Admin-Bereich hat noch keine Tür.')
    expect(page.findAll('nav[aria-label="Hauptnavigation"] a').some(a => a.text() === 'Bibliothek')).toBe(true)
  })

  it('renders the Spielbrett state in the event shell, without the hub navigation', async () => {
    const page = await visit('/e/freitags-zocken-k7q2/brett')

    expect(page.get('h1').text()).toBe('Spielbrett im Rohbau.')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(false)
  })

  it('renders the generic state for an unknown area', async () => {
    const page = await visit('/crews')

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
  })

  it('links the call to action to Home', async () => {
    const page = await visit('/archiv')
    const cta = page.findAll('main a').find(link => link.text().includes('Zur Startseite'))

    expect(cta?.attributes('href')).toBe('/')
  })

  it('hides the decorative scene from assistive technology', async () => {
    const page = await visit('/archiv')

    expect(page.get('main').findAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    expect(page.get('h1').element.closest('[aria-hidden="true"]')).toBeNull()
  })
})
