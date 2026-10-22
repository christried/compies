import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import CatchAllPage from '~/pages/[...path].vue'
import { kitty, signInAs } from './auth'

async function visit(route: string) {
  return mountSuspended(CatchAllPage, { route })
}

describe('construction page route guard', () => {
  beforeEach(() => signInAs(kitty))

  it('renders the Archiv state with its own title in the hub shell', async () => {
    const page = await visit('/archiv')

    expect(page.get('h1').text()).toBe('Das Archiv wird noch gemauert.')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(true)
  })

  it('renders the Profil and Bibliothek states', async () => {
    expect((await visit('/profil')).get('h1').text()).toBe('Profil? Der Bagger ist bestellt.')
    expect((await visit('/bibliothek')).get('h1').text()).toBe('Die Bibliothek ist noch eingerüstet.')
  })

  it('renders the Spielbrett state in the session shell, without the hub navigation', async () => {
    const page = await visit('/s/freitags-zocken-k7q2/brett')

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
