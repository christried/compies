import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import CatchAllPage from '~/pages/[...path].vue'
import { kitty, signInAs } from './auth'

const currentPath = () => useRouter().currentRoute.value.fullPath

describe('route guard and logout', () => {
  it('sends a signed-out visitor to sign-in, keeping the target', async () => {
    signInAs(null)

    await mountSuspended(CatchAllPage, { route: '/archiv' })

    expect(useRoute().path).toBe('/anmelden')
    expect(useRoute().query.redirect).toBe('/archiv')
  })

  it('sends a User without a Display name to profile setup first', async () => {
    signInAs({ ...kitty, displayName: null })

    await mountSuspended(CatchAllPage, { route: '/archiv' })

    expect(useRoute().path).toBe('/einrichten')
    expect(useRoute().query.redirect).toBe('/archiv')
  })

  it('shows Admin in the navigation to the Platform admin', async () => {
    signInAs({ ...kitty, isAdmin: true })

    const page = await mountSuspended(CatchAllPage, { route: '/archiv' })

    expect(page.findAll('nav[aria-label="Hauptnavigation"] a').some(a => a.text() === 'Admin')).toBe(true)
  })

  it('logs out from the avatar menu', async () => {
    signInAs(kitty)
    const signOut = vi.fn(() => ({ success: true }))
    registerEndpoint('/api/auth/sign-out', { method: 'POST', handler: signOut })
    const page = await mountSuspended(CatchAllPage, { route: '/archiv' })

    await page.get('button[aria-label="Konto von Kitty"]').trigger('click')
    await page.get('[role="menuitem"]').trigger('click')

    await vi.waitFor(() => expect(currentPath()).toBe('/anmelden'))
    expect(signOut).toHaveBeenCalled()
    expect(useAuthUser().value).toBeNull()
  })

  it('logs out from the Profil Construction page', async () => {
    signInAs(kitty)
    const signOut = vi.fn(() => ({ success: true }))
    registerEndpoint('/api/auth/sign-out', { method: 'POST', handler: signOut })
    const page = await mountSuspended(CatchAllPage, { route: '/profil' })

    await page.findAll('main button').find(b => b.text() === 'Abmelden')!.trigger('click')

    await vi.waitFor(() => expect(currentPath()).toBe('/anmelden'))
    expect(signOut).toHaveBeenCalled()
  })
})
