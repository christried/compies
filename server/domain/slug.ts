import { INVITE_TOKEN_LENGTH } from '../../shared/links'

// New Session addresses (ADR 0006): the slug is the kebab-cased name plus 4 random characters, the
// Invite token 12 base62 characters. Reading an address is in shared/links.ts.

const SLUG_SUFFIX_LENGTH = 4
const SLUG_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const FALLBACK_SLUG_BASE = 'session'

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
export function createInviteToken(): string {
  return randomChars(INVITE_TOKEN_LENGTH, BASE62)
}
