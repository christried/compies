// Sign-in route guard (#1 § Auth and permissions). Every app route needs a signed-in User who has
// finished profile setup, except sign-in itself, the invite preview and the legal pages.

export const SIGN_IN_PATH = '/anmelden'
export const SETUP_PATH = '/einrichten'
const LEGAL_PATHS = ['/impressum', '/datenschutz']

export interface GuardUser {
  displayName: string | null
}

interface GuardRoute {
  path: string
  fullPath: string
  query: Record<string, unknown>
}

/** An Invite link is `/s/<slug>-<token>` with a 12-character base62 token (ADR 0006). */
export function isInviteLinkPath(path: string) {
  return /^\/s\/[^/]+-[A-Za-z0-9]{12}$/.test(path)
}

/** A redirect target from the query, if it stays on this site; Home otherwise. */
export function safeRedirect(target: unknown): string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return '/'
  return target
}

function withRedirect(path: string, target: string) {
  return target === '/' ? path : `${path}?redirect=${encodeURIComponent(target)}`
}

/** Where to send the visitor instead of `to`, or null to let them through. */
export function guardRoute(to: GuardRoute, user: GuardUser | null): string | null {
  if (LEGAL_PATHS.includes(to.path)) return null
  // Sign-in and profile setup carry the original target along in `redirect`.
  const target = to.path === SIGN_IN_PATH || to.path === SETUP_PATH ? safeRedirect(to.query.redirect) : to.fullPath

  if (!user) {
    if (to.path === SIGN_IN_PATH || isInviteLinkPath(to.path)) return null
    return withRedirect(SIGN_IN_PATH, to.fullPath)
  }
  if (user.displayName === null) {
    return to.path === SETUP_PATH ? null : withRedirect(SETUP_PATH, target)
  }
  return to.path === SIGN_IN_PATH || to.path === SETUP_PATH ? target : null
}
