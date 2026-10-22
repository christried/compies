import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SetupPage from '~/pages/einrichten.vue'
import { kitty, signInAs } from './auth'

const newUser = { ...kitty, name: 'kitty_tv', displayName: null }

describe('profile setup', () => {
  beforeEach(() => signInAs(newUser))

  it('prefills the Display name from the provider', async () => {
    const page = await mountSuspended(SetupPage, { route: '/einrichten' })

    expect(page.get('h1').text()).toBe('Wie sollen wir dich nennen?')
    expect((page.get('input').element as HTMLInputElement).value).toBe('kitty_tv')
    expect(page.text()).toContain('8/32')
  })

  it('stops at 32 characters, counting an emoji as one like the server does', async () => {
    const page = await mountSuspended(SetupPage, { route: '/einrichten' })

    await page.get('input').setValue('🎮'.repeat(40))

    expect((page.get('input').element as HTMLInputElement).value).toBe('🎮'.repeat(32))
    expect(page.text()).toContain('32/32')
  })

  it('shows an inline error and blocks the button with a reason when the name is empty', async () => {
    const save = vi.fn()
    registerEndpoint('/api/profile/setup', { method: 'POST', handler: save })
    const page = await mountSuspended(SetupPage, { route: '/einrichten' })

    await page.get('input').setValue('   ')
    await page.get('form').trigger('submit')

    const help = page.get('#display-name-help')
    expect(help.text()).toBe('Ohne Namen geht’s nicht.')
    expect(page.get('input').attributes('aria-invalid')).toBe('true')
    const cta = page.get('button[type="submit"]')
    expect(cta.attributes('aria-disabled')).toBe('true')
    expect(cta.attributes('aria-describedby')).toBe('display-name-help')
    expect(save).not.toHaveBeenCalled()
  })

  it('saves the name and goes on to the original target', async () => {
    const saved = vi.fn()
    registerEndpoint('/api/profile/setup', {
      method: 'POST',
      handler: async (event) => {
        const { displayName } = await readBody(event)
        saved(displayName)
        return { user: { ...newUser, displayName } }
      },
    })
    const page = await mountSuspended(SetupPage, { route: '/einrichten?redirect=%2Farchiv' })

    await page.get('input').setValue('Kitty Kat')
    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(useRouter().currentRoute.value.fullPath).toBe('/archiv'))
    expect(saved).toHaveBeenCalledWith('Kitty Kat')
    expect(useAuthUser().value?.displayName).toBe('Kitty Kat')
  })
})
