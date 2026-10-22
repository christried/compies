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
    expect(page.get('main').text()).toContain('PLATZHALTER')
  })

  it('render the Datenschutzerklärung signed out, in the bare shell', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(page.get('h1').text()).toBe('Datenschutzerklärung')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(false)
    expect(page.get('main').text()).toContain('PLATZHALTER')
  })

  it('mark every placeholder, so none of it can ship as real text', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const sections = page.findAll('section')

    expect(sections.length).toBeGreaterThan(1)
    for (const section of sections) {
      expect(section.get('p').text()).toMatch(/^\[PLATZHALTER: .+\]$/)
    }
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
