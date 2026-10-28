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
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => alphabet[byte % 64]).join('')
  return `${gameId}-${random}.webp`
}
