import { env, evictDurableObject } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { envelope, roomPath, type Envelope, type RoomPublishBody } from '../../shared/realtime'
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

/** A call that sends last messages to the named Users' sockets and closes them (#913). */
async function publishClose(event: string, close: unknown, last: unknown, options?: { secret?: string, at?: number }) {
  return post(event, JSON.stringify({ close, last }), options)
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

  it('still publishes and answers the clock after an Emote went through the room (#767)', async () => {
    const { socket, received } = await open('event-1', { sub: 'user-1' })
    await settle()

    socket.send(JSON.stringify({ type: 'emote.send', emote: 'clap' }))
    await vi.waitFor(() => expect(received.filter(message => message.type === 'emote.sent')).toHaveLength(1))
    const message = changed()
    await publish('event-1', [message])
    socket.send(JSON.stringify({ type: 'clock.ping', t0: 7 }))
    await vi.waitFor(() => expect(received.filter(m => m.type === 'clock.pong')).toHaveLength(1))

    expect(received.filter(m => m.type === 'event.changed')).toEqual([message])
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
    const messages = [changed(), envelope({ type: 'veto.cast', drawId: 'draw-1', team: 1 }, Date.now())]

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

/** An open socket that remembers whether it was closed, with the messages it received (presence included). */
async function member(event: string, sub: string) {
  const { socket, received } = await open(event, { sub })
  let closed = false
  socket.addEventListener('close', () => void (closed = true))
  return { socket, received, isClosed: () => closed }
}

const own = (received: Envelope[]) => received.filter(message => !isRoomOwn(message))
const leavesOf = (received: Envelope[], userId: string) => received.filter(message => message.type === 'presence.leave' && 'userId' in message && message.userId === userId)

describe('closing the sockets of named Users (#913)', () => {
  it('sends the last messages to the named Users only, then closes their sockets', async () => {
    const ada = await member('close-1', 'ada')
    const bob = await member('close-1', 'bob')
    await settle()
    const last = [changed(), envelope({ type: 'event.changed' }, 2)]
    const body = { close: ['ada'], last } satisfies RoomPublishBody

    const response = await post('close-1', JSON.stringify(body))
    await vi.waitFor(() => expect(ada.isClosed()).toBe(true))
    await settle()

    expect(response.status).toBe(204)
    expect(own(ada.received)).toEqual(last)
    expect(own(bob.received)).toEqual([])
    expect(bob.isClosed()).toBe(false)
    expect(bob.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
  })

  it('tells the others once that the User left, and counts them offline at once', async () => {
    await member('close-2', 'ada')
    const bob = await member('close-2', 'bob')
    await settle()

    await publishClose('close-2', ['ada', 'ada'], [changed()])
    await settle()
    const carla = await member('close-2', 'carla')
    await settle()

    expect(leavesOf(bob.received, 'ada')).toHaveLength(1)
    expect(carla.received.find(message => message.type === 'presence.sync')).toMatchObject({ userIds: expect.arrayContaining(['bob', 'carla']) })
    expect(carla.received.find(message => message.type === 'presence.sync')).not.toMatchObject({ userIds: expect.arrayContaining(['ada']) })
  })

  it('closes every socket of a User, sends each the last messages and tells the others of one leave', async () => {
    const first = await member('close-3', 'ada')
    const second = await member('close-3', 'ada')
    const bob = await member('close-3', 'bob')
    await settle()
    const last = [changed()]

    await publishClose('close-3', ['ada'], last)
    await vi.waitFor(() => expect(first.isClosed() && second.isClosed()).toBe(true))
    await settle()

    expect(own(first.received)).toEqual(last)
    expect(own(second.received)).toEqual(last)
    expect(leavesOf(bob.received, 'ada')).toHaveLength(1)
    expect(leavesOf(first.received, 'ada')).toEqual([])
    expect(leavesOf(second.received, 'ada')).toEqual([])
  })

  it('leaves the socket of the same User in another Event alone', async () => {
    const here = await member('close-4', 'ada')
    const there = await member('close-5', 'ada')
    await settle()

    await publishClose('close-4', ['ada'], [changed()])
    await vi.waitFor(() => expect(here.isClosed()).toBe(true))
    await settle()

    expect(there.isClosed()).toBe(false)
    expect(there.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
    expect(own(there.received)).toEqual([])
  })

  it('answers 204 and sends nothing for a User with no socket', async () => {
    const bob = await member('close-6', 'bob')
    await settle()

    const response = await publishClose('close-6', ['nobody'], [changed()])
    await settle()

    expect(response.status).toBe(204)
    expect(own(bob.received)).toEqual([])
    expect(bob.received.filter(message => message.type === 'presence.leave')).toEqual([])
    expect(bob.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
  })

  it('does nothing for an empty list of Users', async () => {
    const ada = await member('close-7', 'ada')
    await settle()

    const response = await publishClose('close-7', [], [changed()])
    await settle()

    expect(response.status).toBe(204)
    expect(own(ada.received)).toEqual([])
    expect(ada.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
  })

  it('closes the sockets without a last message when there is none, the others still hear the leave', async () => {
    const ada = await member('close-8', 'ada')
    const bob = await member('close-8', 'bob')
    await settle()

    const response = await publishClose('close-8', ['ada'], [])
    await vi.waitFor(() => expect(ada.isClosed()).toBe(true))
    await settle()

    expect(response.status).toBe(204)
    expect(own(ada.received)).toEqual([])
    expect(leavesOf(bob.received, 'ada')).toHaveLength(1)
  })

  it('reaches a closed User with no later broadcast or named send, and takes no Emote from them', async () => {
    const ada = await member('close-9', 'ada')
    const bob = await member('close-9', 'bob')
    await settle()
    await publishClose('close-9', ['ada'], [changed()])
    await vi.waitFor(() => expect(ada.isClosed()).toBe(true))
    await settle()
    const before = ada.received.length

    const later = changed()
    await publish('close-9', [later])
    await publishTo('close-9', ['ada', 'bob'], [later])
    try {
      ada.socket.send(JSON.stringify({ type: 'emote.send', emote: 'clap' }))
    }
    catch {
      // A closed socket may refuse the send itself; either way the room must not pass an Emote on.
    }
    await settle()

    expect(ada.received).toHaveLength(before)
    expect(own(bob.received)).toEqual([later, later])
    expect(bob.received.filter(message => message.type === 'emote.sent')).toEqual([])
  })

  it('still finds the sockets after the room was evicted', async () => {
    const ada = await member('close-10', 'ada')
    const bob = await member('close-10', 'bob')
    await settle()

    await evictDurableObject(env.EventRoom.getByName('close-10'))
    const response = await publishClose('close-10', ['ada'], [changed()])
    await vi.waitFor(() => expect(ada.isClosed()).toBe(true))
    await settle()

    expect(response.status).toBe(204)
    expect(own(ada.received)).toHaveLength(1)
    expect(leavesOf(bob.received, 'ada')).toHaveLength(1)
    expect(bob.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
  })

  it('refuses a malformed or mixed call with 400, sends nothing and closes nothing', async () => {
    const ada = await member('close-11', 'ada')
    await settle()
    const message = changed()
    const malformed: [string, Record<string, unknown>][] = [
      ['close not an array', { close: 'ada', last: [message] }],
      ['close with a non-string', { close: ['ada', 1], last: [message] }],
      ['last missing', { close: ['ada'] }],
      ['last not an array', { close: ['ada'], last: message }],
      ['last with another protocol version', { close: ['ada'], last: [{ ...message, v: 2 }] }],
      ['last with no type', { close: ['ada'], last: [{ v: 1, serverTime: 1 }] }],
      ['last alone', { last: [message] }],
      ['messages, close and last', { messages: [message], close: ['ada'], last: [message] }],
      ['to, direct, close and last', { to: ['ada'], direct: [message], close: ['ada'], last: [message] }],
      ['messages and close', { messages: [message], close: ['ada'] }],
      ['close, last and direct', { close: ['ada'], last: [message], direct: [message] }],
    ]

    for (const [name, body] of malformed) {
      const response = await post('close-11', JSON.stringify(body))
      expect(response.status, name).toBe(400)
    }
    await settle()

    expect(ada.received.filter(received => received.type !== 'presence.sync')).toEqual([])
    expect(ada.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
  })

  it('refuses a call that is stale, badly signed or changed after it was signed, and closes nothing', async () => {
    const ada = await member('close-12', 'ada')
    await settle()
    const call = await signRoomCall(JSON.stringify({ close: ['ada'], last: [changed()] }), INTERNAL_SECRET, Date.now())

    const tampered = await exports.default.fetch(`https://rt.test${roomPath('close-12')}`, {
      method: 'POST',
      headers: { [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp, [ROOM_CALL_SIGNATURE_HEADER]: call.signature },
      body: JSON.stringify({ close: ['ada', 'bob'], last: [changed()] }),
    })
    const stale = await publishClose('close-12', ['ada'], [changed()], { at: Date.now() - 61_000 })
    const unsigned = await publishClose('close-12', ['ada'], [changed()], { secret: 'someone-elses-secret' })
    await settle()

    expect([tampered.status, stale.status, unsigned.status]).toEqual([401, 401, 401])
    expect(ada.received.filter(received => received.type !== 'presence.sync')).toEqual([])
    expect(ada.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
  })
})
