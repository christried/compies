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
export type ThemeColorMeta = { key: string, name: 'theme-color', content: string, media?: string }

/** The `theme-color` metas for an Appearance: one for Hell, one for Dunkel, both with their media for System (#401). */
export function themeColorMetas(appearance: Appearance): ThemeColorMeta[] {
  // Distinct keys, or unhead keeps only one meta per name and System loses a look.
  const light: ThemeColorMeta = { key: 'theme-color-light', name: 'theme-color', content: THEME_COLORS.light }
  const dark: ThemeColorMeta = { key: 'theme-color-dark', name: 'theme-color', content: THEME_COLORS.dark }
  if (appearance === 'light') return [light]
  if (appearance === 'dark') return [dark]
  return [
    { ...light, media: '(prefers-color-scheme: light)' },
    { ...dark, media: '(prefers-color-scheme: dark)' },
  ]
}
