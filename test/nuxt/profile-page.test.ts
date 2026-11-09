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

  describe('the card „Einstellungen“ (#400)', () => {
    type Page = Awaited<ReturnType<typeof mount>>
    const toggleIn = (page: Page) => page.get('main [role="switch"]')
    const headerSound = (page: Page) => page.get('header button[aria-label="Ton"]')
    const resolve = (page: Page, id: string | undefined) => page.get(`[id="${id}"]`).text()

    beforeEach(() => {
      useState('sound-enabled').value = true
      try {
        localStorage.removeItem('compies-sound')
      }
      catch {
        // Storage blocked: the default (sound on) stands.
      }
    })

    it('sits between the card „Profil“ and „Abmelden“, titled „Einstellungen“', async () => {
      const page = await mount()

      expect(page.findAll('main h2').map(h => h.text())).toEqual(['Profil', 'Einstellungen'])
      const section = page.get('section[aria-labelledby="settings-card-title"]')
      const abmelden = page.findAll('main button').find(b => b.text() === 'Abmelden')!
      expect(section.element.compareDocumentPosition(abmelden.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows the row „Ton“ with its description, starting on', async () => {
      const page = await mount()

      const sw = toggleIn(page)
      expect(resolve(page, sw.attributes('aria-labelledby'))).toBe('Ton')
      expect(resolve(page, sw.attributes('aria-describedby'))).toBe('Clips starten mit Ton. Wird auf diesem Gerät gemerkt.')
      expect(sw.attributes('aria-checked')).toBe('true')
      expect(headerSound(page).attributes('aria-pressed')).toBe('true')
    })

    it('changes the header\'s toggle from the row\'s switch', async () => {
      const page = await mount()

      await toggleIn(page).trigger('click')

      expect(toggleIn(page).attributes('aria-checked')).toBe('false')
      expect(headerSound(page).attributes('aria-pressed')).toBe('false')
      expect(localStorage.getItem('compies-sound')).toBe('off')
    })

    it('changes the row\'s switch from the header\'s toggle', async () => {
      const page = await mount()

      await headerSound(page).trigger('click')
      expect(toggleIn(page).attributes('aria-checked')).toBe('false')

      await headerSound(page).trigger('click')
      expect(toggleIn(page).attributes('aria-checked')).toBe('true')
      expect(localStorage.getItem('compies-sound')).toBe('on')
    })

    it('keeps the choice over a reload through the existing storage', async () => {
      const first = await mount()
      await toggleIn(first).trigger('click')
      first.unmount()

      // A reload: a fresh app state that has not read the storage yet.
      useState('sound-enabled').value = true
      const page = await mount()
      await flushPromises()

      expect(toggleIn(page).attributes('aria-checked')).toBe('false')
      expect(headerSound(page).attributes('aria-pressed')).toBe('false')
    })

    it('shows the switch off when the device stored „off“ before', async () => {
      localStorage.setItem('compies-sound', 'off')

      const page = await mount()
      await flushPromises()

      expect(toggleIn(page).attributes('aria-checked')).toBe('false')
    })

    it('names the switch „Ton“ and lets the keyboard reach it', async () => {
      const page = await mountSuspended(ProfilePage, { route: '/profil', attachTo: document.body })

      const sw = toggleIn(page)
      expect(sw.element.tagName).toBe('BUTTON')
      expect(sw.attributes('type')).toBe('button')
      expect(sw.attributes('tabindex')).toBeUndefined()
      expect(sw.attributes('aria-disabled')).toBeUndefined()
      expect(resolve(page, sw.attributes('aria-labelledby'))).toBe('Ton')
      ;(sw.element as HTMLButtonElement).focus()
      expect(document.activeElement).toBe(sw.element)
      page.unmount()
    })
  })
})
