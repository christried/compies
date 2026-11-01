import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserMenu from '~/components/UserMenu.vue'
import ImpressumPage from '~/pages/impressum.vue'
import DatenschutzPage from '~/pages/datenschutz.vue'
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
    expect(page.get('main').text()).toContain('compies@christried.me')
  })

  it('render the Datenschutzerklärung signed out, in the bare shell', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(page.get('h1').text()).toBe('Datenschutzerklärung')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(false)
    expect(page.get('main').text()).toContain('Discord')
    expect(page.get('main').text()).toContain('Twitch')
  })

  it('name the YouTube player and the Cloudflare R2 image storage', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(page.get('main').text()).toContain('YouTube')
    expect(page.get('main').text()).toContain('youtube-nocookie')
    expect(page.get('main').text()).toContain('Cloudflare')
  })

  it('tell in the image and YouTube sections that Members see the pools\' games only while the Host shows them the pools (#225)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    const text = page.get('main').text()
    const sentence = 'dessen Spielepool oder Tiebreaker-Pool das Spiel enthält, solange der Host ihnen die Pools vorher zeigt (Einstellung „Pool vorher zeigen“; bei verdecktem Rad nie).'
    expect(text.split(sentence)).toHaveLength(3)
    expect(text).not.toContain('solange das Rad nicht verdeckt ist')
  })

  it('say in the events section that only Hosts, the Host of the Event whose pool holds the game, and admins read a game\'s notes (#224)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    const text = page.get('main').text()
    expect(text).toContain('Lesen können sie Personen mit Host-Berechtigung und Admins, außerdem der Host eines Events, dessen Spielepool oder Tiebreaker-Pool das Spiel enthält.')
    expect(text).not.toContain('das Spiel enthält, solange sie die Spiele dieses Pools sehen')
  })

  it('name the live connection to Cloudflare Workers, since the browser connects there itself (#156)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const live = page.findAll('section').find(s => s.get('h2').text().includes('Live-Verbindung'))

    expect(live?.text()).toContain('Cloudflare Workers')
    expect(live?.text()).toContain('IP-Adresse')
    expect(live?.text()).toContain('EU-Jurisdiktion')
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

  it('puts Impressum, Datenschutz and the version in the avatar menu, not a version pill', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu)

    await menu.get('button[aria-haspopup="menu"]').trigger('click')

    const items = menu.findAll('[role="menuitem"]')
    expect(items.map(item => item.text())).toEqual(['Abmelden', 'Impressum', 'Datenschutz', expect.stringMatching(/^Version \d+\.\d+\.\d+/)])
    expect(items.slice(1).map(item => item.attributes('href'))).toEqual(['/impressum', '/datenschutz', '/neuigkeiten'])
    expect(menu.get('[role="none"]').text()).toContain('Kitty')
    expect(menu.findAll('*').filter(el => /^v\d+\.\d+\.\d+$/.test(el.text().trim()))).toHaveLength(0)
  })

  it('closes the menu on Esc and gives focus back to the avatar button', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu, { attachTo: document.body })
    const avatar = menu.get('button[aria-haspopup="menu"]')
    await avatar.trigger('click')

    await menu.get('[role="menu"]').trigger('keydown', { key: 'Escape' })

    expect(menu.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(avatar.element)
    menu.unmount()
  })

  it('moves focus to the next menu item on ArrowDown', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu, { attachTo: document.body })
    await menu.get('button[aria-haspopup="menu"]').trigger('click')
    const abmelden = menu.get('[role="menuitem"]')
    expect(document.activeElement).toBe(abmelden.element)

    await abmelden.trigger('keydown', { key: 'ArrowDown' })

    expect(document.activeElement).toBe(menu.findAll('[role="menuitem"]')[1]!.element)
    menu.unmount()
  })

  it('shows the reduced-motion hover on an overlay above the avatar, not on the covered button', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu)
    const button = menu.get('button[aria-haspopup="menu"]')

    // The avatar is opaque and covers the button, so the tint sits on a layer above it.
    expect(button.classes()).not.toContain('motion-reduce:hover:tint')
    const overlay = button.get('span.pointer-events-none')
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
