import PartySocket from 'partysocket'
import { HEARTBEAT_MS, HEARTBEAT_PING, ROOM_PARTY } from '~~/shared/realtime'

// The one place the browser opens a socket to the room (#156): a PartySocket, which reconnects by itself and asks for
// a fresh token on every attempt. Everything else talks to this small interface, so tests swap the factory for a fake
// socket (mockNuxtImport on `createRoomSocket`) and emit open, close and messages by hand. While the socket is open it
// sends the heartbeat (#162): plain-text `ping` every HEARTBEAT_MS, which the room answers without waking up.

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
  /** Sends text to the room while the socket is open; text sent while it is not is dropped, never queued. */
  send: (data: string) => void
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
  let open = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const send = (data: string) => {
    if (open) socket.send(data)
  }
  socket.addEventListener('open', () => {
    open = true
    clearInterval(heartbeat)
    heartbeat = setInterval(() => send(HEARTBEAT_PING), HEARTBEAT_MS)
    options.onOpen()
  })
  socket.addEventListener('close', () => {
    open = false
    clearInterval(heartbeat)
    options.onClose()
  })
  socket.addEventListener('message', (event) => {
    if (typeof event.data === 'string') options.onMessage(event.data)
  })
  return {
    send,
    close: () => {
      clearInterval(heartbeat)
      socket.close()
    },
    reconnect: () => socket.reconnect(),
  }
}
