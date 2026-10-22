// Session addresses (ADR 0006). A Session link is `/s/<slug>`, where the slug is the kebab-cased name
// plus 4 random characters. An Invite link is `/s/<slug>-<token>`, where the token is 12 base62
// characters. The token has a fixed length, so the router splits on the last `-`.

const SLUG_SUFFIX_LENGTH = 4
const SLUG_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const INVITE_TOKEN_LENGTH = 12
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const FALLBACK_SLUG_BASE = 'session'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const INVITE_PATTERN = new RegExp(`^(.+)-([A-Za-z0-9]{${INVITE_TOKEN_LENGTH}})$`)

export type SessionLink = { kind: 'session', slug: string } | { kind: 'invite', slug: string, token: string }

/** `count` characters drawn uniformly from `alphabet`, by rejecting bytes that would bias the modulo. */
function randomChars(count: number, alphabet: string): string {
  const limit = 256 - (256 % alphabet.length)
  let out = ''
  while (out.length < count) {
    for (const byte of crypto.getRandomValues(new Uint8Array(count))) {
      if (byte < limit && out.length < count) out += alphabet[byte % alphabet.length]
    }
  }
  return out
}

/** The name in kebab case, umlauts spelled out and other accents dropped. Empty when it has no Latin letters or digits. */
export function kebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The Session slug for a name: kebab case plus a random suffix. The suffix is injectable for tests. */
export function createSlug(name: string, suffix = randomChars(SLUG_SUFFIX_LENGTH, SLUG_SUFFIX_ALPHABET)): string {
  return `${kebabCase(name) || FALLBACK_SLUG_BASE}-${suffix}`
}

/** A fresh Invite token: 12 base62 characters. */
export function createInviteToken(token = randomChars(INVITE_TOKEN_LENGTH, BASE62)): string {
  return token
}

/** What a `/s/<segment>` path addresses, or null when the segment is neither a Session nor an Invite link. */
export function parseSessionPath(segment: string): SessionLink | null {
  const invite = INVITE_PATTERN.exec(segment)
  if (invite && SLUG_PATTERN.test(invite[1]!)) return { kind: 'invite', slug: invite[1]!, token: invite[2]! }
  return SLUG_PATTERN.test(segment) ? { kind: 'session', slug: segment } : null
}
