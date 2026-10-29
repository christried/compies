// What the room and the app say to each other (spec #153 § Protocol, ADR 0012, ADR 0013). The app and the Worker
// (realtime/) import this file, so it holds types and tiny helpers only. No message carries a game's name, id,
// image or clip: `event.changed` has no payload and the client refetches the Event read, which filters per viewer.

export const ROOM_PROTOCOL_VERSION = 1

/**
 * The message types of the room. A change of an Event queues these with `publish`; later tickets add the types of
 * presence, moves, Sessions, the Activity feed and the clock here.
 */
export type RoomMessage =
  /** Something about the Event changed; the client refetches the Event read. */
  | { type: 'event.changed' }

export type RoomMessageType = RoomMessage['type']

/** What the room sends: every message in an envelope that carries the version and the server's clock. */
export type Envelope<M extends RoomMessage = RoomMessage> = M & {
  v: typeof ROOM_PROTOCOL_VERSION
  /** Milliseconds since the epoch on the server, the moment it sent the message. */
  serverTime: number
}

export function envelope<M extends RoomMessage>(message: M, serverTime: number): Envelope<M> {
  return { ...message, v: ROOM_PROTOCOL_VERSION, serverTime }
}

/** The body of a call to a room (Nuxt to Worker): the messages to send to every socket of the Event. */
export interface RoomPublishBody {
  messages: Envelope[]
}

/** PartyServer's name for the room class: the kebab-case of its binding `EventRoom` (partyserver's routing). */
export const ROOM_PARTY = 'event-room'

/** The path of an Event's room on the Worker, for sockets and for the signed publish call alike. */
export function roomPath(eventId: string): string {
  return `/parties/${ROOM_PARTY}/${encodeURIComponent(eventId)}`
}

/** What the room token endpoint answers: the Worker to connect to and the 60-second token to connect with. */
export interface RoomTicket {
  url: string
  token: string
}
