import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import IndexPage from '~/pages/index.vue'
import SignInPage from '~/pages/anmelden.vue'
import ImpressumPage from '~/pages/impressum.vue'
import NeuigkeitenPage from '~/pages/neuigkeiten.vue'
import { useHostDock } from '~/composables/useHostDock'
import { RELEASES } from '~/utils/changelog'
import { kitty, signInAs } from './auth'

registerEndpoint('/api/e', { method: 'GET', handler: () => ({ events: [] }) })

const VERSION = RELEASES[0]!.version
describe('page footer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the three links and the newest version on a hub page, signed in, hidden below md', async () => {
    signInAs({ ...kitty, newsSeen: VERSION })
    const page = await mountSuspended(IndexPage, { route: '/' })
    const footer = page.get('footer')

    expect(footer.findAll('a').map(a => a.attributes('href'))).toEqual(['/impressum', '/datenschutz', '/neuigkeiten'])
    expect(footer.findAll('a').map(a => a.text())).toEqual(['Impressum', 'Datenschutz', `Version ${VERSION}`])
    expect(footer.classes()).toContain('max-md:hidden')
  })

  it('shows the same footer on the sign-in page, signed out, at every width', async () => {
    signInAs(null)
    const page = await mountSuspended(SignInPage, { route: '/anmelden' })
    const footer = page.get('footer')

    expect(footer.findAll('a').map(a => a.attributes('href'))).toEqual(['/impressum', '/datenschutz', '/neuigkeiten'])
    expect(footer.findAll('a').map(a => a.text())).toEqual(['Impressum', 'Datenschutz', `Version ${VERSION}`])
    expect(footer.classes()).not.toContain('max-md:hidden')
    expect(footer.text()).not.toContain('Neu')
  })

  it('says the version link is new while this device has not seen the newest Release', async () => {
    signInAs(kitty)
    const page = await mountSuspended(IndexPage, { route: '/' })
    const link = page.get('footer a[href="/neuigkeiten"]')

    expect(link.attributes('aria-label')).toBe(`Version ${VERSION}, neu`)
    expect(link.text()).toContain('Neu')
  })

  it('shows no chip once the newest Release is seen', async () => {
    signInAs({ ...kitty, newsSeen: VERSION })
    const page = await mountSuspended(IndexPage, { route: '/' })
    const link = page.get('footer a[href="/neuigkeiten"]')

    expect(link.attributes('aria-label')).toBeUndefined()
    expect(link.text()).not.toContain('Neu')
  })

  it('never shows the chip signed out', async () => {
    signInAs(null)
    const page = await mountSuspended(SignInPage, { route: '/anmelden' })
    const link = page.get('footer a[href="/neuigkeiten"]')

    expect(link.attributes('aria-label')).toBeUndefined()
    expect(page.find('footer span.bg-primary.uppercase').exists()).toBe(false)
  })

  it('marks the current page with aria-current', async () => {
    signInAs(null)
    const page = await mountSuspended(ImpressumPage, { route: '/impressum' })
    const links = page.get('footer').findAll('a')

    expect(links.map(a => a.attributes('aria-current'))).toEqual(['page', undefined, undefined])
  })

  it('reserves room for the Host dock only while a dock is attached', async () => {
    signInAs(null)
    const detach = useHostDock().attach()
    const docked = await mountSuspended(SignInPage, { route: '/anmelden' })
    expect(docked.get('footer').find('span.h-32').exists()).toBe(true)
    detach()

    const plain = await mountSuspended(SignInPage, { route: '/anmelden' })
    expect(plain.get('footer').find('span.h-32').exists()).toBe(false)
  })

  it('scrolls to the top when the version link is clicked on Neuigkeiten', async () => {
    signInAs(null)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })

    await page.get('footer a[href="/neuigkeiten"]').trigger('click')

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
  })
})
