// What the room and the app say to each other (spec #153 § Protocol, ADR 0012, ADR 0013). The app and the Worker
// (realtime/) import this file, so it holds types and tiny helpers only. No message carries a game's name, id,
// image or clip: `event.changed` has no payload and the client refetches the Event read, which filters per viewer. The one
// exception is an Activity entry of a game everyone may know (`activity.added`: a game that was set, #228).

import type { ActivityEntry } from './activity'
import type { Place } from './board'

export const ROOM_PROTOCOL_VERSION = 1

/**
 * The message types of the room. A change of an Event queues these with `publish`. `event.changed`: something about the
 * Event changed, the client refetches the Event read. Glücksrad (0.7) adds its Round messages below.
 */
export type RoomMessage
  = | { type: 'event.changed' }
  /** A new entry of the Activity feed (#159); the feed adds it at once. */
    | { type: 'activity.added', entry: ActivityEntry }
  /** A Member took a new place on the Game board; `by` moved them (#160). The board glides the avatar from `from` to `to`. */
    | { type: 'member.moved', userId: string, from: Place, to: Place, by: string }
  /** A new Member joined through the Invite link (#160). */
    | { type: 'member.joined', userId: string }
  /** Sent to a socket that just connected: every user who is online right now, the newcomer included (#162). */
    | { type: 'presence.sync', userIds: string[] }
  /** A user's first socket opened (#162). */
    | { type: 'presence.join', userId: string }
  /** A user's last socket closed or went silent (#162). */
    | { type: 'presence.leave', userId: string }
  /** The answer to a `clock.ping`, to the asking socket only: `t0` is the client's own, the envelope's `serverTime` is the server's (#162). */
    | { type: 'clock.pong', t0: number }
  /** A Player in `team` set their Team word, or removed it (`word: null`) (#161). */
    | { type: 'team.wordSet', team: number, userId: string, word: string | null }
  /** The Host reset the Team name of `team` to its colour name (#161). */
    | { type: 'team.nameReset', team: number }
  /** The Host started a Session (#164). No game data. */
    | { type: 'session.started', sessionId: string }
  /** The Host ended the Running Session (#164). */
    | { type: 'session.ended', sessionId: string }
  /** The first Session started: every team's Team name is frozen (#164). */
    | { type: 'team.nameFrozen' }
  /** The Host set the next game: a Round is open (#228). No game data; the client refetches the Event read. */
    | { type: 'round.set', roundId: string }
  /** The Host put an open Round back (#228). No game data. */
    | { type: 'round.putBack', roundId: string }

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

/** What a client says to the room. Moves, words and Session actions are HTTP calls to Nuxt, never socket messages. */
export type ClientMessage = { type: 'clock.ping', t0: number }

// The heartbeat is plain text, not JSON, so the runtime answers it without waking the room (#162): the client sends
// `ping` every HEARTBEAT_MS and the room's auto-response says `pong`.
export const HEARTBEAT_PING = 'ping'
export const HEARTBEAT_PONG = 'pong'
export const HEARTBEAT_MS = 10_000

/** A socket with no heartbeat for this long is dead: the room's sweep closes it, and its user may go offline (#162).
 * 75 s, not 30: a hidden tab's throttled heartbeat fires about once a minute, so 30 s dropped such tabs and the dot flapped. */
export const SILENT_AFTER_MS = 75_000

/**
 * The body of a call to a room (Nuxt to Worker): the messages for every socket of the Event, or (#227) for the
 * sockets of the named Users only. The named send is its own shape, not `messages` + `to`: the Worker that runs in
 * production ignores unknown keys and would broadcast `messages`, so if Nuxt shipped first a sealed Veto would reach
 * every Party. With `direct`, the old Worker answers 400 (no `messages` array) and sends nothing: it fails closed.
 */
export type RoomPublishBody
  = | { messages: Envelope[] }
    | { to: string[], direct: Envelope[] }

/** PartyServer's name for the room class: the kebab-case of its binding `EventRoom` (partyserver's routing). */
export const ROOM_PARTY = 'event-room'

/** The path of an Event's room on the Worker, for sockets and for the signed publish call alike. */
export function roomPath(eventId: string): string {
  return `/parties/${ROOM_PARTY}/${encodeURIComponent(eventId)}`
}

/**
 * What the room token endpoint answers: the Worker to connect to, the room's name (the Event id, which the Event read
 * does not carry) and the 60-second token to connect with.
 */
export interface RoomTicket {
  url: string
  room: string
  token: string
}
