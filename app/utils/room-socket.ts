import PartySocket from 'partysocket'
import { ROOM_PARTY } from '~~/shared/realtime'

// The one place the browser opens a socket to the room (#156): a PartySocket, which reconnects by itself and asks for
// a fresh token on every attempt. Everything else talks to this small interface, so tests swap the factory for a fake
// socket (mockNuxtImport on `createRoomSocket`) and emit open, close and messages by hand.

export interface RoomSocketOptions {
  /** The Worker, as the token endpoint gives it. */
  url: string
  /** The room's name: the Event id. */
  room: string
  /** A fresh room token; asked for before every (re)connect. */
  token: () => Promise<string>
  onOpen: () => void
  onClose: () => void
  /** The raw text of a message. */
  onMessage: (data: string) => void
}

export interface RoomSocket {
  close: () => void
  /** Drops the socket, if there is one, and connects again at once. */
  reconnect: () => void
}

export function createRoomSocket(options: RoomSocketOptions): RoomSocket {
  const socket = new PartySocket({
    host: options.url,
    party: ROOM_PARTY,
    room: options.room,
    query: async () => ({ token: await options.token() }),
  })
  socket.addEventListener('open', options.onOpen)
  socket.addEventListener('close', options.onClose)
  socket.addEventListener('message', (event) => {
    if (typeof event.data === 'string') options.onMessage(event.data)
  })
  return { close: () => socket.close(), reconnect: () => socket.reconnect() }
}
