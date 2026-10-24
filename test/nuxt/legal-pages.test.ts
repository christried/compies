import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserMenu from '~/components/UserMenu.vue'
import ImpressumPage from '~/pages/impressum.vue'
import DatenschutzPage from '~/pages/datenschutz.vue'
import SignInPage from '~/pages/anmelden.vue'
import { kitty, signInAs } from './auth'

// The back link reads the in-app history entry at click time; a direct visit has none.
const setHistoryBack = (back: string | null) => window.history.replaceState({ ...window.history.state, back }, '')
const backLink = (page: VueWrapper) => page.findAll('a').find(a => a.text().includes('Zurück'))!

describe('legal pages', () => {
  beforeEach(() => signInAs(null))

  it('render the Impressum signed out, in the bare shell', async () => {
    const page = await mountSuspended(ImpressumPage, { route: '/impressum' })

    expect(page.get('h1').text()).toBe('Impressum')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(false)
    expect(page.get('main').text()).toContain('Dominik Christian Gilges')
    expect(page.get('main').text()).toContain('foodieflip.dev@gmail.com')
  })

  it('render the Datenschutzerklärung signed out, in the bare shell', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(page.get('h1').text()).toBe('Datenschutzerklärung')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(false)
    expect(page.get('main').text()).toContain('Discord')
    expect(page.get('main').text()).toContain('Twitch')
  })

  it('ship no placeholder text', async () => {
    for (const [Page, route] of [[ImpressumPage, '/impressum'], [DatenschutzPage, '/datenschutz']] as const) {
      const page = await mountSuspended(Page, { route })

      expect(page.get('main').text()).not.toContain('PLATZHALTER')
    }
  })

  it('split a section text into paragraphs at blank lines', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const controller = page.findAll('section').find(s => s.get('h2').text() === '1. Verantwortlicher')!

    expect(controller.findAll('p')).toHaveLength(2)
    expect(controller.get('p').element.textContent).toContain('Gilges\nAugust-Thyssen-Str. 16\n52249 Eschweiler')
  })

  it('link both pages, Neuigkeiten and the version label from the sign-in footer', async () => {
    signInAs(null)
    const page = await mountSuspended(SignInPage, { route: '/anmelden' })
    const footer = page.get('footer')

    expect(footer.findAll('a').map(a => a.attributes('href'))).toEqual(['/impressum', '/datenschutz', '/neuigkeiten', '/neuigkeiten'])
    expect(footer.findAll('a').at(-1)!.text()).toMatch(/^v\d+\.\d+\.\d+$/)
    expect(footer.findAll('a').at(-1)!.attributes('aria-label')).toMatch(/^Version \d+\.\d+\.\d+, zu den Neuigkeiten$/)
  })

  it('link both pages, Neuigkeiten and the version label from the avatar menu', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu)

    await menu.get('button[aria-haspopup="menu"]').trigger('click')

    const items = menu.findAll('a[role="menuitem"]')
    expect(items.map(a => a.attributes('href'))).toEqual(['/impressum', '/datenschutz', '/neuigkeiten', '/neuigkeiten'])
    expect(items.map(a => a.text())).toEqual(['Impressum', 'Datenschutz', 'Neuigkeiten', expect.stringMatching(/^v\d+\.\d+\.\d+$/)])
  })

  it('dots the version label in the avatar menu until the newest Release is seen', async () => {
    signInAs(kitty)
    localStorage.removeItem('compies.news.seen')
    const menu = await mountSuspended(UserMenu)
    await menu.get('button[aria-haspopup="menu"]').trigger('click')
    const label = () => menu.findAll('a[role="menuitem"]').at(-1)!

    expect(label().attributes('aria-label')).toMatch(/^Version \d+\.\d+\.\d+, neu, zu den Neuigkeiten$/)

    localStorage.setItem('compies.news.seen', label().text().slice(1))
    const seen = await mountSuspended(UserMenu)
    await seen.get('button[aria-haspopup="menu"]').trigger('click')
    expect(seen.findAll('a[role="menuitem"]').at(-1)!.attributes('aria-label')).toMatch(/^Version \d+\.\d+\.\d+, zu den Neuigkeiten$/)
    localStorage.removeItem('compies.news.seen')
  })

  it('shows the reduced-motion hover on an overlay above the avatar, not on the covered button', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu)
    const button = menu.get('button[aria-haspopup="menu"]')

    // The avatar is opaque and covers the button, so the tint sits on a layer above it.
    expect(button.classes()).not.toContain('motion-reduce:hover:tint')
    const overlay = button.get('span:last-child')
    expect(overlay.classes()).toContain('motion-reduce:group-hover:tint')
    expect(overlay.classes()).toContain('reduced:group-hover:tint')
    expect(button.classes()).toContain('group')
  })

  it('goes back in history when the visitor came from inside the app', async () => {
    signInAs(null)
    const page = await mountSuspended(ImpressumPage, { route: '/impressum' })
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})

    setHistoryBack('/neu')
    await backLink(page).trigger('click')

    expect(go).toHaveBeenCalledWith(-1)
  })

  it('links to sign-in on a direct visit when signed out', async () => {
    signInAs(null)
    for (const [Page, route] of [[ImpressumPage, '/impressum'], [DatenschutzPage, '/datenschutz']] as const) {
      setHistoryBack(null)
      const page = await mountSuspended(Page, { route })

      expect(backLink(page).attributes('href')).toBe('/anmelden')
    }
  })

  it('links to Home on a direct visit when signed in', async () => {
    signInAs(kitty)
    setHistoryBack(null)
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(backLink(page).attributes('href')).toBe('/')
  })

  afterEach(() => {
    setHistoryBack(null)
    vi.restoreAllMocks()
  })
})
