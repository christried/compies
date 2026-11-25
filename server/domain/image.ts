// Rules for game images (#143).

/** A WebP file starts with `RIFF`, four size bytes and `WEBP`. The bytes decide, not the content-type header. */
export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const text = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4))
  return text(0) === 'RIFF' && text(8) === 'WEBP'
}

/**
 * A fresh key for each upload, so a replaced image gets a new URL and the long-lived cache of the old one
 * can never serve stale. The random part is url-safe.
 */
export function imageKey(gameId: string): string {
  return `${gameId}-${randomPart()}.webp`
}

function randomPart(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => alphabet[byte % 64]).join('')
}

/** A Profile picture's key starts with this; a game's key starts with the game's UUID, so the two sets never meet (#678). */
export const PROFILE_IMAGE_PREFIX = 'profile-'

/** A fresh key for each upload (#678): a prefix and a random part, no User id. */
export function profileImageKey(): string {
  return `${PROFILE_IMAGE_PREFIX}${randomPart()}.webp`
}

export function isProfileImageKey(key: string): boolean {
  return key.startsWith(PROFILE_IMAGE_PREFIX)
}

const u16 = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8)
const u24 = (bytes: Uint8Array, at: number) => u16(bytes, at) | (bytes[at + 2]! << 16)
const u32 = (bytes: Uint8Array, at: number) => (u24(bytes, at) | (bytes[at + 3]! << 24)) >>> 0

/**
 * The size and animation of a WebP from its header, without decoding it (#678). For files that already pass `isWebp`; null when the header
 * cannot be read (too short for its form, an unknown first chunk). Layout from the WebP container specification: the first chunk's FourCC
 * at byte 12 says the form, all integers are little-endian.
 */
export function webpInfo(bytes: Uint8Array): { width: number, height: number, animated: boolean } | null {
  if (bytes.length < 20) return null
  const fourcc = String.fromCharCode(...bytes.subarray(12, 16))
  if (fourcc === 'VP8 ') {
    // Frame tag at 20–22, start code 9d 01 2a, then 14-bit width and height.
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    return { width: u16(bytes, 26) & 0x3fff, height: u16(bytes, 28) & 0x3fff, animated: false }
  }
  if (fourcc === 'VP8L') {
    // Signature 0x2f, then 14 bits of width - 1 and 14 bits of height - 1.
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null
    const bits = u32(bytes, 21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, animated: false }
  }
  if (fourcc === 'VP8X') {
    // Flags at 20 (animation is 0x02), canvas width - 1 and height - 1 as 24 bits at 24 and 27.
    if (bytes.length < 30) return null
    return { width: u24(bytes, 24) + 1, height: u24(bytes, 27) + 1, animated: (bytes[20]! & 0x02) !== 0 || hasAnimationChunk(bytes) }
  }
  return null
}

/** Walks the chunks from byte 12 (FourCC, u32 size, payload padded to even) and says whether one is ANIM or ANMF. */
function hasAnimationChunk(bytes: Uint8Array): boolean {
  let at = 12
  while (at + 8 <= bytes.length) {
    const name = String.fromCharCode(...bytes.subarray(at, at + 4))
    if (name === 'ANIM' || name === 'ANMF') return true
    const size = u32(bytes, at + 4)
    at += 8 + size + (size % 2)
  }
  return false
}

/**
 * Reads a body stream up to `max` bytes. Returns null as soon as the stream turns out longer, without
 * reading on, so an upload that hides its size (no content-length) is not buffered whole.
 */
export async function readUpTo(stream: ReadableStream<Uint8Array> | undefined, max: number): Promise<Uint8Array | null> {
  if (!stream) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}
