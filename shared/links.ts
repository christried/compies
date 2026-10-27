// Event addresses (ADR 0006), shared by the route guard and the server. An Event link is
// `/e/<slug>`, where the slug is the kebab-cased name plus 4 random characters. An Invite link is
// `/e/<slug>-<token>`, where the token is 12 base62 characters. The token has a fixed length, so the
// address splits on the last `-`.

export const INVITE_TOKEN_LENGTH = 12

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const INVITE_PATTERN = new RegExp(`^(.+)-([A-Za-z0-9]{${INVITE_TOKEN_LENGTH}})$`)

export type EventLink = { kind: 'event', slug: string } | { kind: 'invite', slug: string, token: string }

/** What a `/e/<segment>` path addresses, or null when the segment is neither an Event nor an Invite link. */
export function parseEventPath(segment: string): EventLink | null {
  const invite = INVITE_PATTERN.exec(segment)
  if (invite && SLUG_PATTERN.test(invite[1]!)) return { kind: 'invite', slug: invite[1]!, token: invite[2]! }
  return SLUG_PATTERN.test(segment) ? { kind: 'event', slug: segment } : null
}

/** The Event link's path. */
export function eventPath(slug: string): string {
  return `/e/${slug}`
}

/** The `<segment>` of a `/e/<segment>` path, or null for any other path. */
export function eventPathSegment(path: string): string | null {
  return path.startsWith('/e/') ? path.slice('/e/'.length) : null
}

/** The Invite link's path. */
export function invitePath(slug: string, token: string): string {
  return `/e/${slug}-${token}`
}
