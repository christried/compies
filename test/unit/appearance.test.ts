import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { APPEARANCE_COOKIE, APPEARANCES, appearanceCookieValue, isAppearance } from '../../shared/appearance'
import type { AuthUser } from '../../shared/auth'
import { users } from '../../server/db/schema'
import { clean, normalise, theme } from './css-tokens'
import { THEME_COLORS, renderedAppearance, shownLook, themeColorMetas } from '../../app/utils/appearance'

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
  // Two metas for every Appearance, in this order, so a change of Appearance only changes `content` (#404).
  const LIGHT = '(prefers-color-scheme: light)'
  const DARK = '(prefers-color-scheme: dark)'

  it('gives Hell the light colour on both media', () => {
    expect(themeColorMetas('light')).toEqual([
      { name: 'theme-color', content: '#fff3df', media: LIGHT },
      { name: 'theme-color', content: '#fff3df', media: DARK },
    ])
  })

  it('gives Dunkel the dark colour on both media', () => {
    expect(themeColorMetas('dark')).toEqual([
      { name: 'theme-color', content: '#17121d', media: LIGHT },
      { name: 'theme-color', content: '#17121d', media: DARK },
    ])
  })

  it('gives System each medium its own colour', () => {
    expect(themeColorMetas('system')).toEqual([
      { name: 'theme-color', content: '#fff3df', media: LIGHT },
      { name: 'theme-color', content: '#17121d', media: DARK },
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

// The look on screen, the one rule of whether a choice changes the picture (#931): Hell and Dunkel are their own look, System is the device's.
describe('shownLook', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('shows %s on a device with dark %s as %s', (appearance, systemDark, look) => {
    expect(shownLook(appearance, systemDark)).toBe(look)
  })
})

// The Theme reveal's two rules (#931): jsdom computes no cascade and no View Transition, so the stylesheet is pinned as text. The circle
// itself is `revealFrames` (test/nuxt/theme-reveal.test.ts); these rules keep the old picture still under it and give the cross-fade its time.
describe('the Theme reveal in the stylesheet', () => {
  const css = normalise(clean(theme))

  it('keeps the old and the new picture from animating on their own while the circle spreads', () => {
    expect(css).toMatch(/html\[data-theme-reveal="spread"\]::view-transition-old\(root\),\s*html\[data-theme-reveal="spread"\]::view-transition-new\(root\) \{[^}]*animation: none;[^}]*mix-blend-mode: normal;/)
  })

  it('cross-fades the colours of every element over dur-fast on ease-out while the mark says fade', () => {
    expect(css).toMatch(/html\[data-theme-reveal="fade"\],\s*html\[data-theme-reveal="fade"\] \*,[^{]*\{[^}]*transition-property: [^;]*background-color[^;]*;[^}]*transition-duration: var\(--cp-dur-fast\);[^}]*transition-timing-function: var\(--cp-ease-out\);/)
  })
})

describe('the CHECK on a User\'s Appearance', () => {
  // What drizzle-kit renders into the migration (and compares with the committed snapshot): a change here needs a migration (#603, ADR 0007).
  const [check] = getTableConfig(users).checks
  const rendered = new PgDialect().sqlToQuery(check!.value).sql

  it('keeps its name and its SQL', () => {
    expect(check!.name).toBe('users_appearance_check')
    expect(rendered).toBe('"users"."appearance" IN (\'light\', \'dark\', \'system\')')
  })

  it('names every Appearance and nothing else', () => {
    expect(rendered).toBe(`"users"."appearance" IN (${APPEARANCES.map(value => `'${value}'`).join(', ')})`)
  })
})
