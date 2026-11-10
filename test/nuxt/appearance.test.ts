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

// Hell and Dunkel give both media one colour, System one each; always two metas in this order (#404).
const LIGHT_MEDIA = '(prefers-color-scheme: light)'
const DARK_MEDIA = '(prefers-color-scheme: dark)'
const bothMedia = (content: string) => [{ content, media: LIGHT_MEDIA }, { content, media: DARK_MEDIA }]
const systemBar = [{ content: '#fff3df', media: LIGHT_MEDIA }, { content: '#17121d', media: DARK_MEDIA }]

describe('Appearance on the page', () => {
  it('draws a User on Dunkel dark, with the dark browser bar', async () => {
    signInAs({ ...kitty, appearance: 'dark' })

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('dark')
      expect(themeColors()).toEqual(bothMedia('#17121d'))
    })
  })

  it('gives a User on System both browser bar colours, each with its media', async () => {
    signInAs({ ...kitty, appearance: 'system' })

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('system')
      expect(themeColors()).toEqual(systemBar)
    })
  })

  it('draws a signed-out visitor light', async () => {
    signInAs(null)

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('light')
      expect(themeColors()).toEqual(bothMedia('#fff3df'))
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
      expect(themeColors()).toEqual(bothMedia('#17121d'))
    })
  })
})

// A choice made on the open page (#404): the server rendered the head for the Appearance the page loaded with, and the browser
// bar must follow the User's next choice. Unhead places a client tag by matching it to the elements already in <head>, so the
// start here is the head as the server renders it (plain `<meta>` elements, no `data-hid`), adopted by a fresh render.
describe('the browser bar after a choice on the open page', () => {
  const serverRenderedHead = (metas: { content: string, media?: string }[]) => {
    for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove()
    for (const { content, media } of metas) {
      const element = document.createElement('meta')
      element.setAttribute('name', 'theme-color')
      element.setAttribute('content', content)
      if (media) element.setAttribute('media', media)
      document.head.append(element)
    }
    // Forget what the client head placed itself, so it meets these elements the way it meets a server-rendered head on load.
    const head = injectHead() as unknown as { _dom?: unknown, dirty: boolean }
    head._dom = undefined
    head.dirty = true
  }
  it('turns the bar dark when a User loaded on Hell chooses Dunkel', async () => {
    signInAs(kitty)
    await mountSuspended(ImpressumPage)
    await vi.waitFor(() => expect(theme()).toBe('light'))
    serverRenderedHead([{ content: '#fff3df' }])

    useAuthUser().value = { ...kitty, appearance: 'dark' }

    await vi.waitFor(() => {
      expect(theme()).toBe('dark')
      expect(themeColors()).toEqual(bothMedia('#17121d'))
    })
  })

  it('turns the bar light when a User loaded on Dunkel chooses Hell', async () => {
    signInAs({ ...kitty, appearance: 'dark' })
    await mountSuspended(ImpressumPage)
    await vi.waitFor(() => expect(theme()).toBe('dark'))
    serverRenderedHead([{ content: '#17121d' }])

    useAuthUser().value = { ...kitty, appearance: 'light' }

    await vi.waitFor(() => {
      expect(theme()).toBe('light')
      expect(themeColors()).toEqual(bothMedia('#fff3df'))
    })
  })

  it('gives the bar both looks by their media when a User loaded on Hell chooses System', async () => {
    signInAs(kitty)
    await mountSuspended(ImpressumPage)
    await vi.waitFor(() => expect(theme()).toBe('light'))
    serverRenderedHead([{ content: '#fff3df' }])

    useAuthUser().value = { ...kitty, appearance: 'system' }

    await vi.waitFor(() => {
      expect(theme()).toBe('system')
      expect(themeColors()).toEqual(systemBar)
    })
  })

  it('turns a System bar dark when the User chooses Dunkel', async () => {
    signInAs({ ...kitty, appearance: 'system' })
    await mountSuspended(ImpressumPage)
    await vi.waitFor(() => expect(theme()).toBe('system'))
    serverRenderedHead(systemBar)

    useAuthUser().value = { ...kitty, appearance: 'dark' }

    await vi.waitFor(() => {
      expect(theme()).toBe('dark')
      expect(themeColors()).toEqual(bothMedia('#17121d'))
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
      expect(themeColors()).toEqual(bothMedia('#17121d'))
    })
  })

  it('draws a signed-out visitor with the cookie system in System, with both browser bar colours', async () => {
    await cookieStore.set('compies-appearance', 'system')

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => {
      expect(theme()).toBe('system')
      expect(themeColors()).toEqual(systemBar)
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
    expect(themeColors()).toEqual(bothMedia('#17121d'))
  })
})
