// What defines an Appearance (GLOSSARY § Appearance); the CHECK on the users table (server/db/schema.ts) is built from the list (#603).

/** A User's Appearance (GLOSSARY): Hell, Dunkel or System; light unless they choose otherwise (#401). */
export const APPEARANCES = ['light', 'dark', 'system'] as const

export type Appearance = typeof APPEARANCES[number]

export function isAppearance(value: unknown): value is Appearance {
  return (APPEARANCES as readonly unknown[]).includes(value)
}

/** The cookie that keeps a device's Appearance for the signed-out pages (#403): `dark` or `system`, never `light`. */
export const APPEARANCE_COOKIE = 'compies-appearance'

/** What the cookie holds for an Appearance: its value for Dunkel and System, none for Hell (#403). */
export function appearanceCookieValue(appearance: Appearance): 'dark' | 'system' | null {
  return appearance === 'light' ? null : appearance
}
