// Web Crypto helpers shared by the signers: R2 requests (server/utils/r2-store.ts) and the room token and internal call (shared/room-auth.ts). No Node APIs, so they run in Nitro, workerd and the browser.

const encoder = new TextEncoder()

export function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

export async function hmac(key: ArrayBuffer | Uint8Array | string, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? encoder.encode(key) : key
  const cryptoKey = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
}
