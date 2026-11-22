import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ImpressumPage from '~/pages/impressum.vue'
import { kitty, signInAs } from './auth'

// The page is calm in the app's own way when the device has the cookie `compies-motion` (#680, GLOSSARY: Reduced motion):
// `data-motion="reduced"` on <html>, signed in or out; nothing ever sets `full`. Prior art: appearance.test.ts, whose cookie follows
// the browser's CookieStore the same way (happy-dom's store fires its change events, a plain document.cookie write does not).

const motion = () => document.documentElement.getAttribute('data-motion')

describe('Reduced motion on the page', () => {
  beforeEach(() => {
    useState('motion-choice').value = null
  })

  afterEach(async () => {
    await cookieStore.delete('compies-motion')
  })

  it('carries no data-motion without the cookie', async () => {
    signInAs(kitty)

    await mountSuspended(ImpressumPage)
    await nextTick()

    expect(motion()).toBeNull()
  })

  it('carries data-motion="reduced" with the cookie, for a signed-in User', async () => {
    signInAs(kitty)
    await cookieStore.set('compies-motion', 'reduced')

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => expect(motion()).toBe('reduced'))
  })

  it('carries data-motion="reduced" with the cookie for a visitor who is signed out too', async () => {
    signInAs(null)
    await cookieStore.set('compies-motion', 'reduced')

    await mountSuspended(ImpressumPage)

    await vi.waitFor(() => expect(motion()).toBe('reduced'))
  })

  it('never sets full: any other value of the cookie leaves the attribute off', async () => {
    signInAs(kitty)
    await cookieStore.set('compies-motion', 'full')

    await mountSuspended(ImpressumPage)
    await nextTick()
    await new Promise(done => setTimeout(done, 20))

    expect(motion()).toBeNull()
  })

  it('stays after Abmelden, without a reload', async () => {
    signInAs(kitty)
    await cookieStore.set('compies-motion', 'reduced')
    await mountSuspended(ImpressumPage)
    await vi.waitFor(() => expect(motion()).toBe('reduced'))

    useAuthUser().value = null
    await nextTick()
    await new Promise(done => setTimeout(done, 20))

    expect(motion()).toBe('reduced')
  })
})
