import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APPEARANCE_COOKIE, APPEARANCES, appearanceCookieValue, isAppearance, type AuthUser } from '../../shared/auth'
import { THEME_COLORS, renderedAppearance, themeColorMetas } from '../../app/utils/appearance'

// A User's Appearance (#401, GLOSSARY): Hell, Dunkel or System, light unless they choose otherwise. The page renders the signed-in User's,
// signed out the device's cookie (#403), and the browser bar takes the page background of that look.

describe('isAppearance', () => {
  it('knows the three Appearances, in this order', () => {
    expect(APPEARANCES).toEqual(['light', 'dark', 'system'])
    for (const value of ['light', 'dark', 'system']) expect(isAppearance(value), value).toBe(true)
  })

  it('refuses anything else', () => {
    for (const value of ['Dark', 'sepia', '', null, undefined, 1, {}]) expect(isAppearance(value), String(value)).toBe(false)
  })
})

describe('renderedAppearance', () => {
  it.each(['light', 'dark', 'system'] as const)('renders a signed-in User on %s in that Appearance', (appearance) => {
    expect(renderedAppearance({ user: { appearance } })).toBe(appearance)
  })

  it('renders a signed-out visitor light', () => {
    expect(renderedAppearance({ user: null })).toBe('light')
  })

  it('renders light for a User state without a valid Appearance (an answer of the deployment before)', () => {
    expect(renderedAppearance({ user: {} as Pick<AuthUser, 'appearance'> })).toBe('light')
    expect(renderedAppearance({ user: { appearance: 'sepia' } as unknown as Pick<AuthUser, 'appearance'> })).toBe('light')
  })

  // Signed out, the device's cookie decides (#403): `dark` or `system`, light otherwise.
  it.each(['dark', 'system'] as const)('renders a signed-out visitor with the cookie %s in that Appearance', (cookie) => {
    expect(renderedAppearance({ user: null, cookie })).toBe(cookie)
  })

  it('renders a signed-out visitor without the cookie light', () => {
    expect(renderedAppearance({ user: null, cookie: undefined })).toBe('light')
    expect(renderedAppearance({ user: null, cookie: null })).toBe('light')
  })

  it('renders a signed-out visitor with an invalid cookie light', () => {
    for (const cookie of ['light', 'sepia', 'Dark', '', '"dark"']) {
      expect(renderedAppearance({ user: null, cookie }), cookie).toBe('light')
    }
  })

  // The rule has no field for it: the plugin reads only `compies-appearance` (test/nuxt and test/build prove the page).
  it('renders a visitor with only the old nuxt-color-mode cookie light', () => {
    expect(renderedAppearance({ user: null })).toBe('light')
  })

  it('lets a signed-in User win over the cookie, also another User\'s on a shared device', () => {
    expect(renderedAppearance({ user: { appearance: 'light' }, cookie: 'dark' })).toBe('light')
    expect(renderedAppearance({ user: { appearance: 'dark' }, cookie: 'system' })).toBe('dark')
    expect(renderedAppearance({ user: { appearance: 'system' }, cookie: 'dark' })).toBe('system')
  })

  it('renders light for a User state without a valid Appearance, whatever the cookie says', () => {
    expect(renderedAppearance({ user: {} as Pick<AuthUser, 'appearance'>, cookie: 'dark' })).toBe('light')
  })
})

describe('the Appearance cookie', () => {
  it('is named compies-appearance', () => {
    expect(APPEARANCE_COOKIE).toBe('compies-appearance')
  })

  it('holds dark or system, and nothing for Hell', () => {
    expect(appearanceCookieValue('light')).toBeNull()
    expect(appearanceCookieValue('dark')).toBe('dark')
    expect(appearanceCookieValue('system')).toBe('system')
  })
})

describe('themeColorMetas', () => {
  it('gives Hell one light meta', () => {
    expect(themeColorMetas('light')).toEqual([{ key: 'theme-color-light', name: 'theme-color', content: '#fff3df' }])
  })

  it('gives Dunkel one dark meta', () => {
    expect(themeColorMetas('dark')).toEqual([{ key: 'theme-color-dark', name: 'theme-color', content: '#17121d' }])
  })

  it('gives System both, each with its media and its own key', () => {
    expect(themeColorMetas('system')).toEqual([
      { key: 'theme-color-light', name: 'theme-color', content: '#fff3df', media: '(prefers-color-scheme: light)' },
      { key: 'theme-color-dark', name: 'theme-color', content: '#17121d', media: '(prefers-color-scheme: dark)' },
    ])
  })
})

describe('THEME_COLORS', () => {
  // Matched loosely (the selector, then the next page token), since the token file grows System twins (#402).
  const tokens = readFileSync(new URL('../../app/assets/css/compies-tokens.css', import.meta.url), 'utf8')
  const paperAfter = (from: number) => /--cp-paper:\s*(#[0-9a-fA-F]{6})\s*;/.exec(tokens.slice(from))?.[1]?.toLowerCase()

  it('takes the light page background of the tokens', () => {
    expect(THEME_COLORS.light).toBe(paperAfter(0))
  })

  it('takes the dark page background of the tokens', () => {
    const dark = tokens.indexOf('[data-theme="dark"]')
    expect(dark).toBeGreaterThan(-1)
    expect(THEME_COLORS.dark).toBe(paperAfter(dark))
  })
})
