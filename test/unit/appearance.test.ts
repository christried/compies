import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APPEARANCES, isAppearance, type AuthUser } from '../../shared/auth'
import { THEME_COLORS, renderedAppearance, themeColorMetas } from '../../app/utils/appearance'

// A User's Appearance (#401, GLOSSARY): Hell, Dunkel or System, light unless they choose otherwise. The page renders the signed-in User's,
// and the browser bar takes the page background of that look.

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
