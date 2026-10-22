import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import UserMenu from '~/components/UserMenu.vue'
import ImpressumPage from '~/pages/impressum.vue'
import DatenschutzPage from '~/pages/datenschutz.vue'
import SignInPage from '~/pages/anmelden.vue'
import { kitty, signInAs } from './auth'

const link = (wrapper: VueWrapper, href: string) => wrapper.findAll('a').find(a => a.attributes('href') === href)

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

  it('link both pages from the sign-in footer', async () => {
    signInAs(null)
    const page = await mountSuspended(SignInPage, { route: '/anmelden' })

    expect(page.get('footer').element.contains(link(page, '/impressum')!.element)).toBe(true)
    expect(page.get('footer').element.contains(link(page, '/datenschutz')!.element)).toBe(true)
  })

  it('link both pages from the avatar menu', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu)

    await menu.get('button[aria-haspopup="menu"]').trigger('click')

    expect(link(menu, '/impressum')?.attributes('role')).toBe('menuitem')
    expect(link(menu, '/datenschutz')?.attributes('role')).toBe('menuitem')
  })
})
