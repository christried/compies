import { isAppearance, type Appearance, type AuthUser } from '~~/shared/auth'

// The Appearance a page renders and the browser bar's colour for it (#401, GLOSSARY: Appearance): the signed-in User's, or
// signed out the device's `compies-appearance` cookie (#403). Pure, so the plugin (app/plugins/appearance.ts) and the unit
// test share one rule.

/** What the render rule reads (#401, #403). */
export interface AppearanceSources {
  /** The signed-in User, null when signed out. */
  user: Pick<AuthUser, 'appearance'> | null
  /** The raw value of the `compies-appearance` cookie (#403); read only when nobody is signed in. */
  cookie?: string | null
}

/** The Appearance a page renders: the signed-in User's; signed out, the cookie's `dark` or `system`; light otherwise (#401, #403). */
export function renderedAppearance({ user, cookie }: AppearanceSources): Appearance {
  // A signed-in User always wins, also over another User's cookie on a shared device. Checked rather than trusted: a User
  // state from an answer without the key (the deployment before) renders light.
  if (user) return isAppearance(user.appearance) ? user.appearance : 'light'
  return cookie === 'dark' || cookie === 'system' ? cookie : 'light'
}

/** The browser bar's colour per look: the page background (`--cp-paper`) of each token block. test/unit/appearance.test.ts reads the tokens. */
export const THEME_COLORS = { light: '#fff3df', dark: '#17121d' } as const

// A type, not an interface: unhead's meta input has a `data-*` index signature, which only a type alias meets implicitly.
export type ThemeColorMeta = { name: 'theme-color', content: string, media: string }

/**
 * The `theme-color` metas for an Appearance: always two, the light medium's and the dark medium's, so Hell and Dunkel give both
 * media one colour and System gives each its own (#401).
 */
export function themeColorMetas(appearance: Appearance): ThemeColorMeta[] {
  // The shape never changes (#404). Unhead matches a tag to an element already in <head> by its dedupe key, which for a
  // `theme-color` meta is the name plus its position (the name is one unhead lets repeat) and ignores `media`; a custom `key`
  // adds a part the server's element lacks. A list that changed shape, or carried keys, met no element the server rendered:
  // the client appended a second meta and the first stayed, so the bar kept the look the page loaded with. Same two metas in
  // the same order, only `content` moves.
  const content = (look: keyof typeof THEME_COLORS) => appearance === 'system' ? THEME_COLORS[look] : THEME_COLORS[appearance]
  return [
    { name: 'theme-color', content: content('light'), media: '(prefers-color-scheme: light)' },
    { name: 'theme-color', content: content('dark'), media: '(prefers-color-scheme: dark)' },
  ]
}
