import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { envelope, roomPath, type Envelope } from '../../shared/realtime'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, signRoomCall, signRoomToken } from '../../shared/room-auth'
import { INTERNAL_SECRET, TOKEN_SECRET, claims, connect, isRoomOwn, open, settle, track } from './room-helpers'

// The Worker in workerd (#156): who may open a socket, who may publish, and where a published message goes.

/** An open socket in a room, with the messages it has received so far, but not the room's own presence (#162). */
async function join(event: string, overrides: Partial<Parameters<typeof claims>[1]> = {}) {
  const { socket } = await open(event, overrides)
  const published: Envelope[] = []
  socket.addEventListener('message', (message) => {
    const parsed: Envelope = JSON.parse(String(message.data))
    if (!isRoomOwn(parsed)) published.push(parsed)
  })
  return published
}

/** A signed publish call with the given body, sent to the event's room. */
async function post(event: string, body: string, { secret = INTERNAL_SECRET, at = Date.now() } = {}) {
  const call = await signRoomCall(body, secret, at)
  return exports.default.fetch(`https://rt.test${roomPath(event)}`, {
    method: 'POST',
    headers: { [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp, [ROOM_CALL_SIGNATURE_HEADER]: call.signature },
    body,
  })
}

async function publish(event: string, messages: Envelope[], options?: { secret?: string, at?: number }) {
  return post(event, JSON.stringify({ messages }), options)
}

/** A send to the named Users of the Event only (#227). */
async function publishTo(event: string, to: unknown, direct: unknown, options?: { secret?: string, at?: number }) {
  return post(event, JSON.stringify({ to, direct }), options)
}

const changed = () => envelope({ type: 'event.changed' }, Date.now())

describe('opening a socket', () => {
  it('accepts a Member with a token for this Event and an allowed Origin', async () => {
    const response = await connect('event-1', await signRoomToken(claims('event-1'), TOKEN_SECRET))

    expect(response.status).toBe(101)
    response.webSocket!.accept()
    track(response.webSocket!)
  })

  it('accepts a token signed with the previous key while a key rotates', async () => {
    const response = await connect('event-1', await signRoomToken(claims('event-1'), 'old-token-secret'))

    expect(response.status).toBe(101)
    response.webSocket!.accept()
    track(response.webSocket!)
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

describe('sending to named Users (#227)', () => {
  it('reaches every socket of the named Users and none of anyone else in the Event', async () => {
    const ada = await join('event-1', { sub: 'ada' })
    const adaOtherTab = await join('event-1', { sub: 'ada' })
    const bob = await join('event-1', { sub: 'bob' })
    const message = changed()

    const response = await publishTo('event-1', ['ada'], [message])
    await settle()

    expect(response.status).toBe(204)
    expect(ada).toEqual([message])
    expect(adaOtherTab).toEqual([message])
    expect(bob).toEqual([])
  })

  it('answers 204 and sends nothing to an unknown User', async () => {
    const ada = await join('event-1', { sub: 'ada' })

    const response = await publishTo('event-1', ['nobody'], [changed()])
    await settle()

    expect(response.status).toBe(204)
    expect(ada).toEqual([])
  })

  it('reaches no socket of another Event, even of a User with the same sub', async () => {
    const here = await join('event-1', { sub: 'ada' })
    const there = await join('event-2', { sub: 'ada' })

    await publishTo('event-1', ['ada'], [changed()])
    await settle()

    expect(here).toHaveLength(1)
    expect(there).toEqual([])
  })

  it('sends the named messages in order', async () => {
    const ada = await join('event-1', { sub: 'ada' })
    const messages = [changed(), envelope({ type: 'member.joined', userId: 'ada' }, Date.now())]

    await publishTo('event-1', ['ada'], messages)
    await settle()

    expect(ada).toEqual(messages)
  })

  it('sends nothing for an empty list of Users', async () => {
    const ada = await join('event-1', { sub: 'ada' })

    const response = await publishTo('event-1', [], [changed()])
    await settle()

    expect(response.status).toBe(204)
    expect(ada).toEqual([])
  })

  it('refuses a malformed send with 400 and sends nothing', async () => {
    const ada = await join('event-1', { sub: 'ada' })
    const message = changed()
    const malformed: [string, unknown, unknown][] = [
      ['to not an array', 'ada', [message]],
      ['to with a non-string', ['ada', 1], [message]],
      ['direct missing', ['ada'], undefined],
      ['direct with another protocol version', ['ada'], [{ ...message, v: 2 }]],
      ['direct with no type', ['ada'], [{ v: 1, serverTime: 1 }]],
    ]

    for (const [name, to, direct] of malformed) {
      const response = await publishTo('event-1', to, direct)
      expect(response.status, name).toBe(400)
    }
    await settle()

    expect(ada).toEqual([])
  })

  it('refuses a body with both messages and a send, and sends nothing', async () => {
    const ada = await join('event-1', { sub: 'ada' })
    const message = changed()

    const response = await post('event-1', JSON.stringify({ messages: [message], to: ['ada'], direct: [message] }))
    await settle()

    expect(response.status).toBe(400)
    expect(ada).toEqual([])
  })

  it('refuses a named send whose body was changed after it was signed', async () => {
    const ada = await join('event-1', { sub: 'ada' })
    const call = await signRoomCall(JSON.stringify({ to: ['ada'], direct: [changed()] }), INTERNAL_SECRET, Date.now())

    const response = await exports.default.fetch(`https://rt.test${roomPath('event-1')}`, {
      method: 'POST',
      headers: { [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp, [ROOM_CALL_SIGNATURE_HEADER]: call.signature },
      body: JSON.stringify({ to: ['bob'], direct: [changed()] }),
    })
    await settle()

    expect(response.status).toBe(401)
    expect(ada).toEqual([])
  })
})
