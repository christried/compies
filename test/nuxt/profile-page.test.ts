import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '~/pages/profil.vue'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// The Profil page (screen 25, shipped trimmed, #399): the picture, renaming, Abmelden.

const mount = () => mountSuspended(ProfilePage, { route: '/profil' })
const input = (page: Awaited<ReturnType<typeof mount>>) => page.get('input').element as HTMLInputElement

describe('the Profil page', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
  })

  it('shows the picture with its hint and the Display name with help and counter', async () => {
    const page = await mount()

    expect(page.get('h1').text()).toBe('Profil')
    expect(page.text()).toContain('Kommt von Discord oder Twitch. Ein neues Bild siehst du nach deiner nächsten Anmeldung.')
    expect(input(page).value).toBe('Kitty')
    expect(page.text()).toContain('5/32')
    expect(page.get('#display-name-help').text()).toBe('Muss nicht eindeutig sein. Alle sehen ihn überall in Compies.')
  })

  it('keeps „Speichern“ inactive for an unchanged name, also when only spaces are added', async () => {
    const save = vi.fn()
    registerEndpoint('/api/profile/setup', { method: 'POST', handler: save })
    const page = await mount()

    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
    await page.get('input').setValue('Kitty  ')
    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
    await page.get('form').trigger('submit')

    await flushPromises()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps „Speichern“ inactive for an empty name and says why', async () => {
    const save = vi.fn()
    registerEndpoint('/api/profile/setup', { method: 'POST', handler: save })
    const page = await mount()

    await page.get('input').setValue('   ')
    await page.get('form').trigger('submit')

    expect(page.get('#display-name-help').text()).toBe('Ohne Namen geht es nicht. Wie sollen dich die anderen nennen?')
    expect(page.get('input').attributes('aria-invalid')).toBe('true')
    const cta = page.get('button[type="submit"]')
    expect(cta.attributes('aria-disabled')).toBe('true')
    expect(cta.attributes('aria-describedby')).toBe('display-name-help')
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
  })

  it('never sends a too long name, it stops at 32 characters counting an emoji as one', async () => {
    const saved = vi.fn()
    registerEndpoint('/api/profile/setup', {
      method: 'POST',
      handler: async (event) => {
        const { displayName } = await readBody(event)
        saved(displayName)
        return { user: { ...kitty, displayName } }
      },
    })
    const page = await mount()

    await page.get('input').setValue('🎮'.repeat(40))
    expect(input(page).value).toBe('🎮'.repeat(32))
    expect(page.text()).toContain('32/32')
    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(saved).toHaveBeenCalledWith('🎮'.repeat(32)))
  })

  it('keeps a saved 32-character name as it is', async () => {
    signInAs({ ...kitty, displayName: '👍🏽'.repeat(32) })
    const page = await mount()

    expect(input(page).value).toBe('👍🏽'.repeat(32))
    expect(page.text()).toContain('32/32')
    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
  })

  it('saves, toasts „Gespeichert.“ and shows the new name in the header menu at once', async () => {
    const saved = vi.fn()
    registerEndpoint('/api/profile/setup', {
      method: 'POST',
      handler: async (event) => {
        const { displayName } = await readBody(event)
        saved(displayName)
        return { user: { ...kitty, displayName } }
      },
    })
    const page = await mount()

    await page.get('input').setValue('Kitty Kat')
    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('false')
    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(saved).toHaveBeenCalledWith('Kitty Kat'))
    await vi.waitFor(() => expect(useAuthUser().value?.displayName).toBe('Kitty Kat'))
    expect(shownToasts()).toContainEqual(expect.objectContaining({ tone: 'success', text: 'Gespeichert.' }))
    const menu = page.get('button[aria-label="Konto von Kitty Kat"]')
    await menu.trigger('click')
    expect(page.text()).toContain('Kitty Kat')
    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
  })

  it('keeps the input and asks to try again when saving fails', async () => {
    registerEndpoint('/api/profile/setup', {
      method: 'POST',
      handler: () => {
        throw createError({ statusCode: 500 })
      },
    })
    const page = await mount()

    await page.get('input').setValue('Kitty Kat')
    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.find('[role="alert"]').exists()).toBe(true))
    expect(page.get('[role="alert"]').text()).toBe('Speichern hat nicht geklappt. Versuch’s nochmal.')
    expect(input(page).value).toBe('Kitty Kat')
    expect(useAuthUser().value?.displayName).toBe('Kitty')
    expect(shownToasts()).not.toContainEqual(expect.objectContaining({ tone: 'success' }))
  })

  it('signs out with Abmelden', async () => {
    const signOut = vi.fn(() => ({ success: true }))
    registerEndpoint('/api/auth/sign-out', { method: 'POST', handler: signOut })
    const page = await mount()

    await page.findAll('main button').find(b => b.text() === 'Abmelden')!.trigger('click')

    await vi.waitFor(() => expect(useRouter().currentRoute.value.fullPath).toBe('/anmelden'))
    expect(signOut).toHaveBeenCalled()
    expect(useAuthUser().value).toBeNull()
  })

  it('sends a signed-out visitor to Anmelden, keeping the target', async () => {
    signInAs(null)

    await mount()

    expect(useRoute().path).toBe('/anmelden')
    expect(useRoute().query.redirect).toBe('/profil')
  })
})
