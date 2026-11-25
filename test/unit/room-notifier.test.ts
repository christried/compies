import { afterEach, describe, expect, it, vi } from 'vitest'
import { envelope } from '../../shared/realtime'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, verifyRoomCall } from '../../shared/room-auth'
import { httpRoomNotifier, memoryRoomNotifier } from '../../server/utils/room-notifier'

// The real room notifier (#156): signs the messages, posts them to the Event's room, and never fails its caller.
const NOW = Date.UTC(2090, 9, 30, 20, 0, 0)
const changed = envelope({ type: 'event.changed' }, NOW)

describe('httpRoomNotifier', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts the messages to the Event\'s room with a signature the Worker can verify', async () => {
    const send = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(null, { status: 204 }))
    const notifier = httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'internal', fetch: send, now: () => NOW })

    await notifier.publish('event-1', [changed])

    expect(send).toHaveBeenCalledTimes(1)
    const [url, init] = send.mock.calls[0]!
    expect(String(url)).toBe('https://rt.example.workers.dev/parties/event-room/event-1')
    expect(init?.method).toBe('POST')
    const body = String(init?.body)
    expect(JSON.parse(body)).toEqual({ messages: [changed] })
    const headers = new Headers(init?.headers)
    expect(await verifyRoomCall({
      body,
      timestamp: headers.get(ROOM_CALL_TIMESTAMP_HEADER),
      signature: headers.get(ROOM_CALL_SIGNATURE_HEADER),
      secrets: ['internal'],
      now: NOW,
    })).toBe(true)
  })

  it('posts a send to named Users as { to, direct } with no messages key, signed (#227)', async () => {
    const send = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(null, { status: 204 }))
    const notifier = httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'internal', fetch: send, now: () => NOW })

    await notifier.publish('event-1', [changed], ['user-1', 'user-2'])

    expect(send).toHaveBeenCalledTimes(1)
    const [url, init] = send.mock.calls[0]!
    expect(String(url)).toBe('https://rt.example.workers.dev/parties/event-room/event-1')
    const body = String(init?.body)
    expect(JSON.parse(body)).toEqual({ to: ['user-1', 'user-2'], direct: [changed] })
    expect(JSON.parse(body)).not.toHaveProperty('messages')
    const headers = new Headers(init?.headers)
    expect(await verifyRoomCall({
      body,
      timestamp: headers.get(ROOM_CALL_TIMESTAMP_HEADER),
      signature: headers.get(ROOM_CALL_SIGNATURE_HEADER),
      secrets: ['internal'],
      now: NOW,
    })).toBe(true)
  })

  it('sends nothing to an empty list of Users (#227)', async () => {
    const send = vi.fn()
    await httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'internal', fetch: send }).publish('event-1', [changed], [])

    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing for no messages', async () => {
    const send = vi.fn()
    await httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'internal', fetch: send }).publish('event-1', [])

    expect(send).not.toHaveBeenCalled()
  })

  it('logs and goes on when the Worker refuses or cannot be reached', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused = httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'x', fetch: async () => new Response(null, { status: 401 }) })
    const down = httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'x', fetch: async () => Promise.reject(new Error('offline')) })

    await expect(refused.publish('event-1', [changed])).resolves.toBeUndefined()
    await expect(down.publish('event-1', [changed])).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('gives up after the timeout instead of holding the request', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hanging = httpRoomNotifier({
      url: 'https://rt.example.workers.dev',
      secret: 'x',
      timeoutMs: 20,
      fetch: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))),
    })

    await expect(hanging.publish('event-1', [changed])).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
  })
})

describe('httpRoomNotifier.close (#681)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts { close, last } to the Event\'s room with a signature the Worker can verify and no messages, to or direct key', async () => {
    const send = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(null, { status: 204 }))
    const notifier = httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'internal', fetch: send, now: () => NOW })

    await notifier.close('event-1', ['user-1', 'user-2'], [changed])

    expect(send).toHaveBeenCalledTimes(1)
    const [url, init] = send.mock.calls[0]!
    expect(String(url)).toBe('https://rt.example.workers.dev/parties/event-room/event-1')
    expect(init?.method).toBe('POST')
    const body = String(init?.body)
    expect(JSON.parse(body)).toEqual({ close: ['user-1', 'user-2'], last: [changed] })
    for (const key of ['messages', 'to', 'direct']) expect(JSON.parse(body)).not.toHaveProperty(key)
    const headers = new Headers(init?.headers)
    expect(await verifyRoomCall({
      body,
      timestamp: headers.get(ROOM_CALL_TIMESTAMP_HEADER),
      signature: headers.get(ROOM_CALL_SIGNATURE_HEADER),
      secrets: ['internal'],
      now: NOW,
    })).toBe(true)
  })

  it('allows an empty last list: the sockets are closed with nothing said', async () => {
    const send = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(null, { status: 204 }))
    await httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'internal', fetch: send }).close('event-1', ['user-1'], [])

    expect(JSON.parse(String(send.mock.calls[0]![1]?.body))).toEqual({ close: ['user-1'], last: [] })
  })

  it('sends nothing for no Users', async () => {
    const send = vi.fn()
    await httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'internal', fetch: send }).close('event-1', [], [changed])

    expect(send).not.toHaveBeenCalled()
  })

  it('logs and goes on when the Worker refuses (401, 400) or cannot be reached in time', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unauthorised = httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'x', fetch: async () => new Response(null, { status: 401 }) })
    const badRequest = httpRoomNotifier({ url: 'https://rt.example.workers.dev', secret: 'x', fetch: async () => new Response(null, { status: 400 }) })
    const hanging = httpRoomNotifier({
      url: 'https://rt.example.workers.dev',
      secret: 'x',
      timeoutMs: 20,
      fetch: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))),
    })

    await expect(unauthorised.close('event-1', ['user-1'], [changed])).resolves.toBeUndefined()
    await expect(badRequest.close('event-1', ['user-1'], [changed])).resolves.toBeUndefined()
    await expect(hanging.close('event-1', ['user-1'], [changed])).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(3)
  })
})

describe('memoryRoomNotifier', () => {
  it('records a close per Event, forgets it on clear, and keeps its last messages out of messages() (#681)', async () => {
    const notifier = memoryRoomNotifier()
    await notifier.publish('event-1', [changed])
    await notifier.close('event-1', ['user-1'], [changed])
    await notifier.close('event-2', ['user-2', 'user-3'], [])
    await notifier.close('event-1', [], [changed])

    expect(notifier.closes('event-1')).toEqual([{ users: ['user-1'], messages: [changed] }])
    expect(notifier.closes('event-2')).toEqual([{ users: ['user-2', 'user-3'], messages: [] }])
    expect(notifier.closes('event-3')).toEqual([])
    expect(notifier.messages('event-1')).toEqual([changed])
    expect(notifier.sends('event-1')).toEqual([{ to: null, messages: [changed] }])

    notifier.clear()
    expect(notifier.closes('event-1')).toEqual([])
  })

  it('records the messages per Event and forgets them on clear', async () => {
    const notifier = memoryRoomNotifier()
    await notifier.publish('event-1', [changed])
    await notifier.publish('event-2', [changed, changed])

    expect(notifier.messages('event-1')).toEqual([changed])
    expect(notifier.messages('event-2')).toHaveLength(2)
    expect(notifier.messages('event-3')).toEqual([])

    notifier.clear()
    expect(notifier.messages('event-1')).toEqual([])
  })

  it('records the named Users of a send, and messages() returns broadcast and named messages (#227)', async () => {
    const notifier = memoryRoomNotifier()
    const vetoed = envelope({ type: 'veto.cast', drawId: 'draw-1', team: 1 }, NOW)
    await notifier.publish('event-1', [changed])
    await notifier.publish('event-1', [vetoed], ['user-1'])
    await notifier.publish('event-1', [changed], [])

    expect(notifier.sends('event-1')).toEqual([
      { to: null, messages: [changed] },
      { to: ['user-1'], messages: [vetoed] },
    ])
    expect(notifier.messages('event-1')).toEqual([changed, vetoed])

    notifier.clear()
    expect(notifier.sends('event-1')).toEqual([])
  })
})
