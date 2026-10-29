import { env, evictDurableObject, runDurableObjectAlarm } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEARTBEAT_PING, HEARTBEAT_PONG, SILENT_AFTER_MS } from '../../shared/realtime'
import { open, settle } from './room-helpers'

// Who is online (#162, spec #153 § Online): the room derives it from the open sockets, never from a memory field.
const types = (received: { type: string }[]) => received.map(message => message.type)

describe('presence', () => {
  it('tells a newcomer everybody who is online, the newcomer included', async () => {
    await open('presence-1', { sub: 'anna' })
    const { received } = await open('presence-1', { sub: 'ben' })

    await settle()

    const sync = received.find(message => message.type === 'presence.sync')
    expect(sync).toMatchObject({ type: 'presence.sync', userIds: expect.arrayContaining(['anna', 'ben']) })
    expect(sync && 'userIds' in sync && sync.userIds).toHaveLength(2)
  })

  it('tells the others when a user\'s first socket opens, once however many sockets they open', async () => {
    const { received: anna } = await open('presence-2', { sub: 'anna' })
    await settle()

    await open('presence-2', { sub: 'ben' })
    await open('presence-2', { sub: 'ben' })
    await settle()

    expect(anna.filter(message => message.type === 'presence.join')).toEqual([expect.objectContaining({ userId: 'ben' })])
  })

  it('keeps a user online while one of their sockets is open, and tells the others when the last one closes', async () => {
    const { received: anna } = await open('presence-3', { sub: 'anna' })
    const first = await open('presence-3', { sub: 'ben' })
    const second = await open('presence-3', { sub: 'ben' })
    await settle()

    first.socket.close()
    await settle()
    expect(types(anna)).not.toContain('presence.leave')

    second.socket.close()
    await settle()
    expect(anna.filter(message => message.type === 'presence.leave')).toEqual([expect.objectContaining({ userId: 'ben' })])
  })

  it('keeps the presence of one Event out of the room of another', async () => {
    const { received: other } = await open('presence-5', { sub: 'carla' })
    const { socket } = await open('presence-4', { sub: 'ben' })
    await settle()

    socket.close()
    await settle()

    expect(types(other)).toEqual(['presence.sync'])
  })
})

const roomOf = (event: string) => env.EventRoom.getByName(event)

/** Opens a socket as if it had connected `ago` ms before: the room stamps the socket with the clock of the moment. */
async function openAgo(ago: number, event: string, sub: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() - ago)
  try {
    return await open(event, { sub })
  }
  finally {
    vi.useRealTimers()
  }
}

describe('the sweep', () => {
  afterEach(() => void vi.useRealTimers())

  it('closes a socket that never sent a heartbeat for 30 s and tells the others its user left', async () => {
    const { received: anna } = await open('sweep-1', { sub: 'anna' })
    const ben = await openAgo(SILENT_AFTER_MS + 1000, 'sweep-1', 'ben')
    let closed = false
    ben.socket.addEventListener('close', () => void (closed = true))
    await settle()

    expect(await runDurableObjectAlarm(roomOf('sweep-1'))).toBe(true)
    await settle()

    expect(closed).toBe(true)
    expect(anna.filter(message => message.type === 'presence.leave')).toEqual([expect.objectContaining({ userId: 'ben' })])
  })

  it('does not tell the others twice when the dropped socket then closes', async () => {
    const { received: anna } = await open('sweep-2', { sub: 'anna' })
    await openAgo(SILENT_AFTER_MS + 1000, 'sweep-2', 'ben')
    await settle()

    await runDurableObjectAlarm(roomOf('sweep-2'))
    await settle()

    expect(anna.filter(message => message.type === 'presence.leave')).toHaveLength(1)
  })

  it('keeps a socket that sends the heartbeat, and the runtime answers it with pong', async () => {
    const { received: anna } = await open('sweep-3', { sub: 'anna' })
    const ben = await openAgo(SILENT_AFTER_MS + 1000, 'sweep-3', 'ben')
    const heard: string[] = []
    ben.socket.addEventListener('message', message => void heard.push(String(message.data)))
    await settle()

    ben.socket.send(HEARTBEAT_PING)
    await vi.waitFor(() => expect(heard).toContain(HEARTBEAT_PONG))
    await runDurableObjectAlarm(roomOf('sweep-3'))
    await settle()

    expect(anna.map(message => message.type)).not.toContain('presence.leave')
    expect(ben.socket.readyState).toBe(WebSocket.READY_STATE_OPEN)
  })

  it('keeps a user online while another socket of theirs is alive', async () => {
    const { received: anna } = await open('sweep-4', { sub: 'anna' })
    await openAgo(SILENT_AFTER_MS + 1000, 'sweep-4', 'ben')
    await open('sweep-4', { sub: 'ben' })
    await settle()

    await runDurableObjectAlarm(roomOf('sweep-4'))
    await settle()

    expect(anna.map(message => message.type)).not.toContain('presence.leave')
  })

  it('sets the next sweep while a socket is open, and none when the last one is gone', async () => {
    const { socket } = await open('sweep-5', { sub: 'anna' })
    await settle()

    expect(await runDurableObjectAlarm(roomOf('sweep-5'))).toBe(true)
    expect(await runDurableObjectAlarm(roomOf('sweep-5'))).toBe(true)

    socket.close()
    await settle()
    expect(await runDurableObjectAlarm(roomOf('sweep-5'))).toBe(true)
    expect(await runDurableObjectAlarm(roomOf('sweep-5'))).toBe(false)
  })
})

describe('hibernation', () => {
  it('still knows who is online after the room was evicted, and tells the others when they leave', async () => {
    const { received: anna } = await open('hibernate-1', { sub: 'anna' })
    const ben = await open('hibernate-1', { sub: 'ben' })
    await settle()

    await evictDurableObject(roomOf('hibernate-1'))
    const carla = await open('hibernate-1', { sub: 'carla' })
    await settle()
    expect(carla.received.find(message => message.type === 'presence.sync')).toMatchObject({ userIds: expect.arrayContaining(['anna', 'ben', 'carla']) })

    ben.socket.close()
    await settle()
    expect(anna.filter(message => message.type === 'presence.leave')).toEqual([expect.objectContaining({ userId: 'ben' })])
  })
})

describe('the clock', () => {
  it('answers a clock.ping with the same t0 and the server time, to the asking socket only', async () => {
    const asking = await open('clock-1', { sub: 'anna' })
    const other = await open('clock-1', { sub: 'ben' })
    await settle()
    const before = Date.now()

    asking.socket.send(JSON.stringify({ type: 'clock.ping', t0: 12345.5 }))
    await vi.waitFor(() => expect(asking.received.filter(message => message.type === 'clock.pong')).toHaveLength(1))
    await settle()

    const pong = asking.received.find(message => message.type === 'clock.pong')
    expect(pong).toMatchObject({ v: 1, type: 'clock.pong', t0: 12345.5 })
    expect(pong!.serverTime).toBeGreaterThanOrEqual(before)
    expect(pong!.serverTime).toBeLessThanOrEqual(Date.now())
    expect(other.received.filter(message => message.type === 'clock.pong')).toEqual([])
  })

  it('ignores a clock.ping without a number, text that is no JSON and anything else a client says', async () => {
    const { socket, received } = await open('clock-2', { sub: 'anna' })
    await settle()

    socket.send(JSON.stringify({ type: 'clock.ping', t0: 'now' }))
    socket.send('not json')
    socket.send(JSON.stringify({ type: 'member.moved', userId: 'anna' }))
    socket.send(JSON.stringify({ type: 'clock.ping', t0: 1 }))
    await vi.waitFor(() => expect(received.filter(message => message.type === 'clock.pong')).toHaveLength(1))
    await settle()

    expect(received.map(message => message.type)).toEqual(['presence.sync', 'clock.pong'])
  })
})
