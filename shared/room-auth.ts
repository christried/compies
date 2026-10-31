import { hex, hmac } from './crypto'
import { asRecord } from './record'

// The two secrets of the room (ADR 0012, ADR 0013, #156). Web Crypto only, so Nitro and workerd run the same code.
//  - The room token: Nuxt signs it, the browser carries it to the Worker. HS256 JWT, valid for 60 s, checked at connect.
//  - The internal call: Nuxt posts messages to a room, signed with an HMAC over timestamp and body.
// Every verifier takes a list of keys: the current one first, the previous one after it while a key is rotated.

export const ROOM_TOKEN_TTL_SECONDS = 60
export const ROOM_CALL_MAX_AGE_MS = 60_000
export const ROOM_CALL_TIMESTAMP_HEADER = 'x-room-timestamp'
export const ROOM_CALL_SIGNATURE_HEADER = 'x-room-signature'

export interface RoomClaims {
  /** The User. */
  sub: string
  /** The Event, which is also the room's name. */
  evt: string
  host: boolean
  /** Seconds since the epoch, like every JWT. */
  exp: number
  jti: string
}

export type RoomTokenRefusal = 'malformed' | 'signature' | 'expired' | 'wrong_event'

export type RoomTokenResult = { ok: true, claims: RoomClaims } | { ok: false, reason: RoomTokenRefusal }

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const HEADER = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** The bytes behind a base64url string, or null when it is not one. */
function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[\w-]*$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  }
  catch {
    return null
  }
}

/** Compares two strings in time that depends on the length only. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

async function signature(signingInput: string, secret: string): Promise<string> {
  return base64Url(new Uint8Array(await hmac(secret, signingInput)))
}

/** The token the browser presents to the Worker: `header.payload.signature`. */
export async function signRoomToken(claims: RoomClaims, secret: string): Promise<string> {
  const signingInput = `${HEADER}.${base64Url(encoder.encode(JSON.stringify(claims)))}`
  return `${signingInput}.${await signature(signingInput, secret)}`
}

function asClaims(value: unknown): RoomClaims | null {
  const { sub, evt, host, exp, jti } = asRecord(value)
  if (typeof sub !== 'string' || typeof evt !== 'string' || typeof host !== 'boolean' || typeof exp !== 'number' || typeof jti !== 'string') return null
  return { sub, evt, host, exp, jti }
}

/**
 * Checks the signature against every key, then the claims, the expiry and, when given, the Event. `now` is in
 * milliseconds. The reason says which check failed; the Worker answers every one of them the same way.
 */
export async function verifyRoomToken(token: string, options: { secrets: string[], now: number, eventId?: string }): Promise<RoomTokenResult> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [header, payload, given] = parts as [string, string, string]
  if (header !== HEADER || !given) return { ok: false, reason: 'malformed' }

  const signingInput = `${header}.${payload}`
  let signed = false
  for (const secret of options.secrets) {
    if (sameText(await signature(signingInput, secret), given)) signed = true
  }
  if (!signed) return { ok: false, reason: 'signature' }

  const bytes = fromBase64Url(payload)
  let parsed: unknown
  try {
    parsed = bytes ? JSON.parse(decoder.decode(bytes)) : null
  }
  catch {
    parsed = null
  }
  const claims = asClaims(parsed)
  if (!claims) return { ok: false, reason: 'malformed' }
  if (claims.exp * 1000 <= options.now) return { ok: false, reason: 'expired' }
  if (options.eventId !== undefined && claims.evt !== options.eventId) return { ok: false, reason: 'wrong_event' }
  return { ok: true, claims }
}

/** The headers of a call to a room: a timestamp and the HMAC-SHA256 of `timestamp.body`, in hex. */
export async function signRoomCall(body: string, secret: string, now: number): Promise<{ timestamp: string, signature: string }> {
  const timestamp = String(now)
  return { timestamp, signature: hex(await hmac(secret, `${timestamp}.${body}`)) }
}

/** Whether the call carries a signature of one of the keys and a timestamp within a minute of `now`. */
export async function verifyRoomCall(call: {
  body: string
  timestamp: string | null
  signature: string | null
  secrets: string[]
  now: number
}): Promise<boolean> {
  if (!call.timestamp || !call.signature || !/^\d+$/.test(call.timestamp)) return false
  if (Math.abs(call.now - Number(call.timestamp)) > ROOM_CALL_MAX_AGE_MS) return false

  let signed = false
  for (const secret of call.secrets) {
    if (sameText(hex(await hmac(secret, `${call.timestamp}.${call.body}`)), call.signature)) signed = true
  }
  return signed
}
