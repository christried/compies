import { describe, expect, it } from 'vitest'
import { ROOM_CALL_MAX_AGE_MS, signRoomCall, signRoomToken, verifyRoomCall, verifyRoomToken, type RoomClaims } from '../../shared/room-auth'

// The room token (browser -> Worker) and the signed internal call (Nuxt -> Worker), #156. Both are Web Crypto only.
const NOW = Date.UTC(2090, 9, 30, 20, 0, 0)
const claims: RoomClaims = { sub: 'user-1', evt: 'event-1', host: true, exp: Math.floor(NOW / 1000) + 60, jti: 'jti-1' }

describe('room token', () => {
  it('round-trips the claims', async () => {
    const token = await signRoomToken(claims, 'secret-a')

    expect(await verifyRoomToken(token, { secrets: ['secret-a'], now: NOW, eventId: 'event-1' })).toEqual({ ok: true, claims })
  })

  it('is a three-part HS256 JWT', async () => {
    const [header, payload, signature] = (await signRoomToken(claims, 'secret-a')).split('.')

    expect(JSON.parse(atob(header!.replace(/-/g, '+').replace(/_/g, '/')))).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(JSON.parse(atob(payload!.replace(/-/g, '+').replace(/_/g, '/')))).toEqual(claims)
    expect(signature).toMatch(/^[\w-]+$/)
  })

  it('refuses a tampered payload', async () => {
    const [header, , signature] = (await signRoomToken(claims, 'secret-a')).split('.')
    const forged = btoa(JSON.stringify({ ...claims, host: true, sub: 'user-2' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

    expect(await verifyRoomToken(`${header}.${forged}.${signature}`, { secrets: ['secret-a'], now: NOW })).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses a token signed with another key', async () => {
    const token = await signRoomToken(claims, 'secret-b')

    expect(await verifyRoomToken(token, { secrets: ['secret-a'], now: NOW })).toEqual({ ok: false, reason: 'signature' })
  })

  it('accepts a token signed with the previous key', async () => {
    const token = await signRoomToken(claims, 'old-secret')

    expect(await verifyRoomToken(token, { secrets: ['new-secret', 'old-secret'], now: NOW })).toEqual({ ok: true, claims })
  })

  it('refuses an expired token', async () => {
    const token = await signRoomToken(claims, 'secret-a')

    expect(await verifyRoomToken(token, { secrets: ['secret-a'], now: NOW + 60_000 })).toEqual({ ok: false, reason: 'expired' })
    expect(await verifyRoomToken(token, { secrets: ['secret-a'], now: NOW + 59_000 })).toMatchObject({ ok: true })
  })

  it('refuses a token for another Event', async () => {
    const token = await signRoomToken(claims, 'secret-a')

    expect(await verifyRoomToken(token, { secrets: ['secret-a'], now: NOW, eventId: 'event-2' })).toEqual({ ok: false, reason: 'wrong_event' })
  })

  it.each(['', 'abc', 'a.b', 'a.b.c.d', 'a..c'])('refuses the malformed token %j', async (token) => {
    expect(await verifyRoomToken(token, { secrets: ['secret-a'], now: NOW })).toMatchObject({ ok: false })
  })

  it('refuses a token that names another algorithm, even with a matching signature', async () => {
    const [, payload, signature] = (await signRoomToken(claims, 'secret-a')).split('.')
    const none = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '')

    expect(await verifyRoomToken(`${none}.${payload}.${signature}`, { secrets: ['secret-a'], now: NOW })).toMatchObject({ ok: false })
  })

  it('refuses claims of the wrong shape, even when correctly signed', async () => {
    const token = await signRoomToken({ ...claims, host: 'yes' } as unknown as RoomClaims, 'secret-a')

    expect(await verifyRoomToken(token, { secrets: ['secret-a'], now: NOW })).toEqual({ ok: false, reason: 'malformed' })
  })

  it('verifies against no key at all as a refusal', async () => {
    const token = await signRoomToken(claims, 'secret-a')

    expect(await verifyRoomToken(token, { secrets: [], now: NOW })).toMatchObject({ ok: false })
  })
})

describe('signed internal call', () => {
  const body = JSON.stringify({ messages: [{ v: 1, type: 'event.changed', serverTime: NOW }] })

  it('verifies a call it signed', async () => {
    const call = await signRoomCall(body, 'internal-a', NOW)

    expect(await verifyRoomCall({ body, ...call, secrets: ['internal-a'], now: NOW })).toBe(true)
  })

  it('refuses a changed body', async () => {
    const call = await signRoomCall(body, 'internal-a', NOW)

    expect(await verifyRoomCall({ body: body.replace('event.changed', 'event.fake'), ...call, secrets: ['internal-a'], now: NOW })).toBe(false)
  })

  it('refuses a changed timestamp', async () => {
    const call = await signRoomCall(body, 'internal-a', NOW)

    expect(await verifyRoomCall({ body, ...call, timestamp: String(NOW + 1), secrets: ['internal-a'], now: NOW })).toBe(false)
  })

  it('refuses another key and accepts the previous one', async () => {
    const call = await signRoomCall(body, 'old-internal', NOW)

    expect(await verifyRoomCall({ body, ...call, secrets: ['internal-a'], now: NOW })).toBe(false)
    expect(await verifyRoomCall({ body, ...call, secrets: ['internal-a', 'old-internal'], now: NOW })).toBe(true)
  })

  it('refuses a stale call and a call from the future, accepts one just inside the window', async () => {
    const call = await signRoomCall(body, 'internal-a', NOW)

    expect(await verifyRoomCall({ body, ...call, secrets: ['internal-a'], now: NOW + ROOM_CALL_MAX_AGE_MS + 1 })).toBe(false)
    expect(await verifyRoomCall({ body, ...call, secrets: ['internal-a'], now: NOW + ROOM_CALL_MAX_AGE_MS - 1 })).toBe(true)
    expect(await verifyRoomCall({ body, ...call, secrets: ['internal-a'], now: NOW - ROOM_CALL_MAX_AGE_MS - 1 })).toBe(false)
  })

  it('refuses missing or malformed headers', async () => {
    const call = await signRoomCall(body, 'internal-a', NOW)

    expect(await verifyRoomCall({ body, timestamp: null, signature: call.signature, secrets: ['internal-a'], now: NOW })).toBe(false)
    expect(await verifyRoomCall({ body, timestamp: call.timestamp, signature: null, secrets: ['internal-a'], now: NOW })).toBe(false)
    expect(await verifyRoomCall({ body, timestamp: 'soon', signature: call.signature, secrets: ['internal-a'], now: NOW })).toBe(false)
  })
})
