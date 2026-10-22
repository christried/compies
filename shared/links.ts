// Session addresses (ADR 0006), shared by the route guard and the server. A Session link is
// `/s/<slug>`, where the slug is the kebab-cased name plus 4 random characters. An Invite link is
// `/s/<slug>-<token>`, where the token is 12 base62 characters. The token has a fixed length, so the
// address splits on the last `-`.

export const INVITE_TOKEN_LENGTH = 12

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const INVITE_PATTERN = new RegExp(`^(.+)-([A-Za-z0-9]{${INVITE_TOKEN_LENGTH}})$`)

export type SessionLink = { kind: 'session', slug: string } | { kind: 'invite', slug: string, token: string }

/** What a `/s/<segment>` path addresses, or null when the segment is neither a Session nor an Invite link. */
export function parseSessionPath(segment: string): SessionLink | null {
  const invite = INVITE_PATTERN.exec(segment)
  if (invite && SLUG_PATTERN.test(invite[1]!)) return { kind: 'invite', slug: invite[1]!, token: invite[2]! }
  return SLUG_PATTERN.test(segment) ? { kind: 'session', slug: segment } : null
}

/** The Session link's path. */
export function sessionPath(slug: string): string {
  return `/s/${slug}`
}

/** The Invite link's path. */
export function invitePath(slug: string, token: string): string {
  return `/s/${slug}-${token}`
}
