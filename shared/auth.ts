// Sign-in facts the app and the server share.

export const SIGN_IN_PROVIDERS = ['discord', 'twitch'] as const

export type SignInProvider = typeof SIGN_IN_PROVIDERS[number]

export function isSignInProvider(value: unknown): value is SignInProvider {
  return (SIGN_IN_PROVIDERS as readonly unknown[]).includes(value)
}

/** A Display name has 1–32 characters after trimming; an emoji counts as one. */
export const DISPLAY_NAME_MAX = 32
