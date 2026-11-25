import { describe, expect, it } from 'vitest'
import { bootSplashDue } from '~/utils/boot-splash'
import { bootCookie } from '~~/shared/boot'
import { kitty } from '../nuxt/auth'

// The splash of the installed app (#674, spec #927, screen 01): the cookie line the page writes and the rule that decides, once per page load and on
// the server, whether the layer is in the first byte. Whether it then shows is the stylesheet's (`display-mode: standalone`), not this rule's.

describe('the cookie line the page writes', () => {
  it('lasts 24 hours on the whole site and stays on first-party navigation', () => {
    expect(bootCookie(false)).toBe('compies-boot=seen; Max-Age=86400; Path=/; SameSite=Lax')
  })

  it('is Secure on https, as the session cookie is', () => {
    expect(bootCookie(true)).toBe('compies-boot=seen; Max-Age=86400; Path=/; SameSite=Lax; Secure')
  })
})

describe('the splash is in the first byte', () => {
  const due = (path: string, cookie?: string | null) => bootSplashDue({ path, user: kitty, cookie })

  it('for Home, signed in, without the cookie', () => {
    expect(due('/')).toBe(true)
    expect(due('/', null)).toBe(true)
  })

  it('not once the device has the cookie, whatever its value', () => {
    expect(due('/', 'seen')).toBe(false)
    expect(due('/', 'anything')).toBe(false)
    expect(due('/', '')).toBe(false)
  })

  it.each(['/e/x-abc', '/anmelden', '/bibliothek'])('not on %s', (path) => {
    expect(due(path)).toBe(false)
  })

  it('not for a User who is signed out', () => {
    expect(bootSplashDue({ path: '/', user: null, cookie: undefined })).toBe(false)
  })
})
