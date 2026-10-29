import { exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { envelope, roomPath, type Envelope } from '../../shared/realtime'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, signRoomCall, signRoomToken, type RoomClaims } from '../../shared/room-auth'

// The Worker in workerd (#156): who may open a socket, who may publish, and where a published message goes.
const ORIGIN = 'https://app.test'
const TOKEN_SECRET = 'test-token-secret'
const INTERNAL_SECRET = 'test-internal-secret'

const claims = (event: string, overrides: Partial<RoomClaims> = {}): RoomClaims => ({
  sub: 'user-1', evt: event, host: false, exp: Math.floor(Date.now() / 1000) + 60, jti: crypto.randomUUID(), ...overrides,
})

const sockets: WebSocket[] = []
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

function connect(event: string, token: string | null, origin: string | null = ORIGIN) {
  const query = token === null ? '' : `?token=${encodeURIComponent(token)}`
  return exports.default.fetch(`https://rt.test${roomPath(event)}${query}`, {
    headers: { Upgrade: 'websocket', ...(origin ? { Origin: origin } : {}) },
  })
}

/** An open socket in a room, with the messages it has received so far. */
async function join(event: string, overrides: Partial<RoomClaims> = {}) {
  const response = await connect(event, await signRoomToken(claims(event, overrides), TOKEN_SECRET))
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  socket.accept()
  sockets.push(socket)
  const received: Envelope[] = []
  socket.addEventListener('message', (message) => {
    received.push(JSON.parse(String(message.data)))
  })
  return received
}

async function publish(event: string, messages: Envelope[], { secret = INTERNAL_SECRET, at = Date.now() } = {}) {
  const body = JSON.stringify({ messages })
  const call = await signRoomCall(body, secret, at)
  return exports.default.fetch(`https://rt.test${roomPath(event)}`, {
    method: 'POST',
    headers: { [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp, [ROOM_CALL_SIGNATURE_HEADER]: call.signature },
    body,
  })
}

const changed = () => envelope({ type: 'event.changed' }, Date.now())
const settle = () => new Promise(resolve => setTimeout(resolve, 100))

describe('opening a socket', () => {
  it('accepts a Member with a token for this Event and an allowed Origin', async () => {
    const response = await connect('event-1', await signRoomToken(claims('event-1'), TOKEN_SECRET))

    expect(response.status).toBe(101)
    response.webSocket!.accept()
    sockets.push(response.webSocket!)
  })

  it('accepts a token signed with the previous key while a key rotates', async () => {
    const response = await connect('event-1', await signRoomToken(claims('event-1'), 'old-token-secret'))

    expect(response.status).toBe(101)
    response.webSocket!.accept()
    sockets.push(response.webSocket!)
  })

  it('refuses a token with a bad signature', async () => {
    const response = await connect('event-1', await signRoomToken(claims('event-1'), 'someone-elses-secret'))

    expect(response.status).toBe(401)
    expect(response.webSocket).toBeNull()
  })

  it('refuses an expired token', async () => {
    const response = await connect('event-1', await signRoomToken(claims('event-1', { exp: Math.floor(Date.now() / 1000) - 1 }), TOKEN_SECRET))

    expect(response.status).toBe(401)
  })

  it('refuses a token for another Event', async () => {
    const response = await connect('event-2', await signRoomToken(claims('event-1'), TOKEN_SECRET))

    expect(response.status).toBe(401)
  })

  it('refuses a request without a token, and a token that is no token', async () => {
    expect((await connect('event-1', null)).status).toBe(401)
    expect((await connect('event-1', 'not-a-token')).status).toBe(401)
  })

  it('refuses a foreign Origin, and no Origin, even with a good token', async () => {
    const token = await signRoomToken(claims('event-1'), TOKEN_SECRET)

    expect((await connect('event-1', token, 'https://evil.test')).status).toBe(403)
    expect((await connect('event-1', token, null)).status).toBe(403)
  })
})

describe('publishing', () => {
  it('sends a message to every socket of its Event and to none of another', async () => {
    const first = await join('event-1', { sub: 'user-1' })
    const second = await join('event-1', { sub: 'user-2' })
    const other = await join('event-2')
    const message = changed()

    const response = await publish('event-1', [message])
    await settle()

    expect(response.status).toBe(204)
    expect(first).toEqual([message])
    expect(second).toEqual([message])
    expect(other).toEqual([])
  })

  it('sends several messages in order', async () => {
    const received = await join('event-1')
    const messages = [changed(), changed()]

    await publish('event-1', messages)
    await settle()

    expect(received).toEqual(messages)
  })

  it('accepts a call signed with the previous key while a key rotates', async () => {
    const received = await join('event-1')

    const response = await publish('event-1', [changed()], { secret: 'old-internal-secret' })
    await settle()

    expect(response.status).toBe(204)
    expect(received).toHaveLength(1)
  })

  it('refuses a call with a bad signature and sends nothing', async () => {
    const received = await join('event-1')

    const response = await publish('event-1', [changed()], { secret: 'someone-elses-secret' })
    await settle()

    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })

  it('refuses a stale call and sends nothing', async () => {
    const received = await join('event-1')

    const response = await publish('event-1', [changed()], { at: Date.now() - 61_000 })
    await settle()

    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })

  it('refuses a call whose body was changed after it was signed', async () => {
    const received = await join('event-1')
    const call = await signRoomCall(JSON.stringify({ messages: [changed()] }), INTERNAL_SECRET, Date.now())

    const response = await exports.default.fetch(`https://rt.test${roomPath('event-1')}`, {
      method: 'POST',
      headers: { [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp, [ROOM_CALL_SIGNATURE_HEADER]: call.signature },
      body: JSON.stringify({ messages: [envelope({ type: 'event.changed' }, 1)] }),
    })
    await settle()

    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })

  it('refuses an unsigned call and a plain GET', async () => {
    expect((await exports.default.fetch(`https://rt.test${roomPath('event-1')}`, { method: 'POST', body: '{"messages":[]}' })).status).toBe(401)
    expect((await exports.default.fetch(`https://rt.test${roomPath('event-1')}`)).status).toBe(405)
  })

  it('answers 404 for a path that is no room', async () => {
    expect((await exports.default.fetch('https://rt.test/')).status).toBe(404)
  })
})
