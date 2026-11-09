import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ImpressumPage from '~/pages/impressum.vue'
import { kitty, signInAs } from './auth'

// The page is drawn in the signed-in User's Appearance (#401): `data-theme` on <html> and the browser bar's colour.
// Signed out, it is light.

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
