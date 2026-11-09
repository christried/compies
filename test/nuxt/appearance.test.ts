import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ImpressumPage from '~/pages/impressum.vue'
import { kitty, signInAs } from './auth'

// The page is drawn in the signed-in User's Appearance (#401): `data-theme` on <html> and the browser bar's colour.
// Signed out, it is the device's `compies-appearance` cookie, light without one (#403).

const theme = () => document.documentElement.getAttribute('data-theme')
const themeColors = () => [...document.head.querySelectorAll('meta[name="theme-color"]')]
  .map(meta => ({ content: meta.getAttribute('content'), media: meta.getAttribute('media') }))

describe('Appearance on the page', () => {
  it('draws a User on Dunkel dark, with the dark browser bar', async () => {
    signInAs({ ...kitty, appearance: 'dark' })

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('dark')
      expect(themeColors()).toEqual([{ content: '#17121d', media: null }])
    })
  })

  it('gives a User on System both browser bar colours, each with its media', async () => {
    signInAs({ ...kitty, appearance: 'system' })

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('system')
      // In any order: the media pick the colour, and unhead keeps an element it already placed where it is.
      expect(themeColors()).toHaveLength(2)
      expect(themeColors()).toEqual(expect.arrayContaining([
        { content: '#fff3df', media: '(prefers-color-scheme: light)' },
        { content: '#17121d', media: '(prefers-color-scheme: dark)' },
      ]))
    })
  })

  it('draws a signed-out visitor light', async () => {
    signInAs(null)

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('light')
      expect(themeColors()).toEqual([{ content: '#fff3df', media: null }])
    })
  })

  it('follows a change of the User without a reload', async () => {
    signInAs(kitty)
    await mountSuspended(ImpressumPage)
    await vi.waitFor(() => expect(theme()).toBe('light'))

    useAuthUser().value = { ...kitty, appearance: 'dark' }
    await nextTick()

    await vi.waitFor(() => {
      expect(theme()).toBe('dark')
      expect(themeColors()).toEqual([{ content: '#17121d', media: null }])
    })
  })
})

// The plugin's cookie follows the browser's CookieStore (Nuxt's experimental.cookieStore), as it follows the route's
// Set-Cookie in a real browser; happy-dom's cookieStore fires its change events, a plain document.cookie write does not (#403).
describe('Appearance on a signed-out page', () => {
  // Unhead writes the head on a timeout after Vue's flush: an Appearance that must stay is checked once that has run.
  const settled = async () => {
    await nextTick()
    await new Promise(done => setTimeout(done, 20))
  }

  // From light, so every case below sees its own Appearance arrive rather than the one the case before left on <html>.
  beforeEach(async () => {
    signInAs(null)
    await vi.waitFor(() => expect(theme()).toBe('light'))
  })

  afterEach(async () => {
    await cookieStore.delete('compies-appearance')
    await cookieStore.delete('nuxt-color-mode')
  })

  it('draws a signed-out visitor with the cookie dark in Dunkel, with the dark browser bar', async () => {
    await cookieStore.set('compies-appearance', 'dark')

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('dark')
      expect(themeColors()).toEqual([{ content: '#17121d', media: null }])
    })
  })

  it('draws a signed-out visitor with the cookie system in System, with both browser bar colours', async () => {
    await cookieStore.set('compies-appearance', 'system')

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('system')
      expect(themeColors()).toHaveLength(2)
    })
  })

  it('ignores the old nuxt-color-mode cookie', async () => {
    await cookieStore.set('nuxt-color-mode', 'dark')

    await mountSuspended(ImpressumPage)
    await settled()

    expect(theme()).toBe('light')
  })

  it('lets the signed-in User win over the cookie', async () => {
    signInAs(kitty)
    await cookieStore.set('compies-appearance', 'dark')

    await mountSuspended(ImpressumPage)
    await settled()

    expect(theme()).toBe('light')
  })

  it('keeps a User\'s Dunkel on the page after Abmelden, without a reload', async () => {
    signInAs({ ...kitty, appearance: 'dark' })
    await cookieStore.set('compies-appearance', 'dark')
    await mountSuspended(ImpressumPage)
    await vi.waitFor(() => expect(theme()).toBe('dark'))

    useAuthUser().value = null
    await settled()

    expect(theme()).toBe('dark')
    expect(themeColors()).toEqual([{ content: '#17121d', media: null }])
  })
})
