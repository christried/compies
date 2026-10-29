import { exports } from 'cloudflare:workers'
import { afterEach, expect } from 'vitest'
import { HEARTBEAT_PONG, roomPath, type Envelope } from '../../shared/realtime'
import { signRoomToken, type RoomClaims } from '../../shared/room-auth'

// What the Worker tests share (#156, #162): tokens, an open socket in a room, and the messages it has received.
export const ORIGIN = 'https://app.test'
export const TOKEN_SECRET = 'test-token-secret'
export const INTERNAL_SECRET = 'test-internal-secret'

export const claims = (event: string, overrides: Partial<RoomClaims> = {}): RoomClaims => ({
  sub: 'user-1', evt: event, host: false, exp: Math.floor(Date.now() / 1000) + 60, jti: crypto.randomUUID(), ...overrides,
})

const sockets: WebSocket[] = []
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

/** Keeps a socket for the cleanup after the test. */
export function track(socket: WebSocket) {
  sockets.push(socket)
}

export function connect(event: string, token: string | null, origin: string | null = ORIGIN) {
  const query = token === null ? '' : `?token=${encodeURIComponent(token)}`
  return exports.default.fetch(`https://rt.test${roomPath(event)}${query}`, {
    headers: { Upgrade: 'websocket', ...(origin ? { Origin: origin } : {}) },
  })
}

/** An open socket in a room with everything it has received so far, presence included. */
export async function open(event: string, overrides: Partial<RoomClaims> = {}) {
  const response = await connect(event, await signRoomToken(claims(event, overrides), TOKEN_SECRET))
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  socket.accept()
  track(socket)
  const received: Envelope[] = []
  socket.addEventListener('message', (message) => {
    // The heartbeat's `pong` is plain text.
    if (message.data !== HEARTBEAT_PONG) received.push(JSON.parse(String(message.data)))
  })
  return { socket, received }
}

/** The room's own presence and clock messages, which the publish tests do not look at. */
export const isRoomOwn = (message: Envelope) => message.type.startsWith('presence.') || message.type === 'clock.pong'

export const settle = () => new Promise(resolve => setTimeout(resolve, 100))
