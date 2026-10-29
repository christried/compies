import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoomSocket } from '../../app/utils/room-socket'
import { HEARTBEAT_MS, HEARTBEAT_PING } from '../../shared/realtime'

// The browser's socket to the room (#156, #162): it sends the heartbeat `ping` while it is open and lets the caller
// send its own text. PartySocket is replaced by a fake that the test opens and closes.
const { fakes } = vi.hoisted(() => ({ fakes: [] as FakeSocket[] }))

interface FakeSocket {
  readyState: number
  sent: string[]
  listeners: Map<string, ((event: unknown) => void)[]>
  send: (data: string) => void
  emit: (type: string, event?: unknown) => void
}

vi.mock('partysocket', () => ({
  default: class {
    readyState = 0
    sent: string[] = []
    listeners = new Map<string, ((event: unknown) => void)[]>()
    constructor() {
      fakes.push(this as unknown as FakeSocket)
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }

    send(data: string) {
      this.sent.push(data)
    }

    emit(type: string, event?: unknown) {
      this.readyState = type === 'open' ? 1 : type === 'close' ? 3 : this.readyState
      for (const listener of this.listeners.get(type) ?? []) listener(event)
    }

    close() {}
    reconnect() {}
  },
}))

function create() {
  const handlers = { onOpen: vi.fn(), onClose: vi.fn(), onMessage: vi.fn() }
  const socket = createRoomSocket({ url: 'https://rt.test', room: 'event-1', token: async () => 'token', ...handlers })
  return { socket, fake: fakes[fakes.length - 1]!, ...handlers }
}

describe('createRoomSocket', () => {
  beforeEach(() => {
    fakes.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => void vi.useRealTimers())

  it('sends the heartbeat every 10 s while the socket is open, and stops when it closes', () => {
    const { fake } = create()

    vi.advanceTimersByTime(HEARTBEAT_MS * 3)
    expect(fake.sent).toEqual([])

    fake.emit('open')
    vi.advanceTimersByTime(HEARTBEAT_MS - 1)
    expect(fake.sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(fake.sent).toEqual([HEARTBEAT_PING])
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(fake.sent).toEqual([HEARTBEAT_PING, HEARTBEAT_PING])

    fake.emit('close')
    vi.advanceTimersByTime(HEARTBEAT_MS * 3)
    expect(fake.sent).toHaveLength(2)
  })

  it('starts the heartbeat again after a reconnect, once, not twice', () => {
    const { fake } = create()
    fake.emit('open')
    fake.emit('close')
    fake.emit('open')

    vi.advanceTimersByTime(HEARTBEAT_MS)

    expect(fake.sent).toEqual([HEARTBEAT_PING])
  })

  it('sends what the caller says while it is open, and nothing while it is not', () => {
    const { socket, fake } = create()

    socket.send('early')
    fake.emit('open')
    socket.send('hello')
    fake.emit('close')
    socket.send('late')

    expect(fake.sent).toEqual(['hello'])
  })

  it('hands on the text of a message, and nothing else', () => {
    const { fake, onMessage } = create()

    fake.emit('message', { data: 'pong' })
    fake.emit('message', { data: new ArrayBuffer(1) })

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('pong')
  })
})
