import type { H3Event } from 'h3'
import { roomPath, type Envelope, type RoomPublishBody } from '../../shared/realtime'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, signRoomCall } from '../../shared/room-auth'
import { keepRunningAfterResponse } from './after-response'

/**
 * Tells the Members who have an Event open what happened (spec #153, ADR 0012, ADR 0013). Nuxt decides and commits;
 * the notifier only hands the resulting messages to the Event's room. It never throws: a missed message is made up
 * by the client's refetch on reconnect and its fallback polling.
 */
export interface RoomNotifier {
  /** Without `to`, the messages go to every socket of the Event; with `to` (#227), to the sockets of those Users only. */
  publish(eventId: string, messages: Envelope[], to?: readonly string[]): Promise<void>
  /**
   * Sends `last` to the sockets of `users`, then closes them (#681, ADR 0013's amendment of 2026-11-20): Nuxt cuts off Users who are no Member
   * of the Event any more. Nothing is sent for no Users; an empty `last` closes without a word.
   */
  close(eventId: string, users: readonly string[], last: Envelope[]): Promise<void>
}

declare module 'h3' {
  interface H3EventContext {
    roomNotifier?: RoomNotifier
  }
}

/** How long a publish waits for the Worker before it gives up on the message (#202: after the response). */
export const ROOM_PUBLISH_TIMEOUT_MS = 2000

/** One call of the notifier: the messages, and the named Users they went to (null: every socket of the Event). */
export interface RoomSend {
  to: string[] | null
  messages: Envelope[]
}

/** One close of the notifier: the Users whose sockets were closed, and the last messages they got first (#681). */
export interface RoomClose {
  users: string[]
  messages: Envelope[]
}

/**
 * Records the messages per Event, for tests (like the in-memory image store). `messages` returns every message of an
 * Event, broadcast and named alike; `sends` keeps each call with its named Users (#227); `closes` keeps each close with its
 * Users and last messages, which `messages` and `sends` do not hold (#681).
 * @public Only tests call it, so knip would report it; the test doubles live next to the interface they stand in for.
 */
export function memoryRoomNotifier(): RoomNotifier & { messages(eventId: string): Envelope[], sends(eventId: string): RoomSend[], closes(eventId: string): RoomClose[], clear(): void } {
  const sent = new Map<string, RoomSend[]>()
  const closed = new Map<string, RoomClose[]>()
  return {
    async publish(eventId, messages, to) {
      if (messages.length === 0 || to?.length === 0) return
      sent.set(eventId, [...(sent.get(eventId) ?? []), { to: to ? [...to] : null, messages }])
    },
    messages: eventId => (sent.get(eventId) ?? []).flatMap(send => send.messages),
    async close(eventId, users, last) {
      if (users.length === 0) return
      closed.set(eventId, [...(closed.get(eventId) ?? []), { users: [...users], messages: last }])
    },
    sends: eventId => sent.get(eventId) ?? [],
    closes: eventId => closed.get(eventId) ?? [],
    clear: () => {
      sent.clear()
      closed.clear()
    },
  }
}

export interface HttpRoomNotifierOptions {
  /** The Worker, e.g. `https://compies-rt.example.workers.dev`. */
  url: string
  /** ROOM_INTERNAL_SECRET. The Worker also knows the previous key; this side only ever signs with the current one. */
  secret: string
  timeoutMs?: number
  fetch?: typeof fetch
  now?: () => number
}

/** Signs the messages and posts them to the Event's room on the Worker. */
export function httpRoomNotifier({ url, secret, timeoutMs = ROOM_PUBLISH_TIMEOUT_MS, fetch: send = fetch, now = Date.now }: HttpRoomNotifierOptions): RoomNotifier {
  /** Signs a body and posts it to the Event's room; logs a refusal or a failure and never throws. */
  async function post(eventId: string, body: RoomPublishBody, what: string) {
    try {
      const text = JSON.stringify(body)
      const call = await signRoomCall(text, secret, now())
      const response = await send(new URL(roomPath(eventId), url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp,
          [ROOM_CALL_SIGNATURE_HEADER]: call.signature,
        },
        body: text,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) console.error(`Room ${what} for Event ${eventId} was refused: ${response.status}`)
    }
    catch (error) {
      console.error(`Room ${what} for Event ${eventId} failed`, error)
    }
  }
  return {
    async publish(eventId, messages, to) {
      if (messages.length === 0 || to?.length === 0) return
      await post(eventId, to ? { to: [...to], direct: messages } : { messages }, 'publish')
    },
    async close(eventId, users, last) {
      if (users.length === 0) return
      await post(eventId, { close: [...users], last }, 'close')
    },
  }
}

/** The Worker's address, or null when this deployment has none (tests, local dev without `wrangler`). */
export function realtimeUrl(): string | null {
  return process.env.REALTIME_URL || null
}

/**
 * Publishes after the response (#202): the request doesn't wait up to ROOM_PUBLISH_TIMEOUT_MS for the Worker. On
 * Vercel, `waitUntil` keeps the function alive until the publish is done (Nitro's Vercel preset doesn't hand
 * `event.waitUntil` to the platform); elsewhere the promise simply runs. A publish never fails the request.
 */
export function publishAfterResponse(event: H3Event, eventId: string, messages: Envelope[], to?: readonly string[]): void {
  // The notifier logs its own failures and never throws; this guard only logs what it did not expect (#195 leftover, #238).
  const sent = useRoomNotifier(event).publish(eventId, messages, to).catch((error: unknown) => {
    console.error(`Room notifier threw for Event ${eventId}`, error)
  })
  keepRunningAfterResponse(sent)
}

/** Like `publishAfterResponse`, for the call that sends `last` to the sockets of `users` and closes them (#681). */
export function closeAfterResponse(event: H3Event, eventId: string, users: readonly string[], last: Envelope[]): void {
  const sent = useRoomNotifier(event).close(eventId, users, last).catch((error: unknown) => {
    console.error(`Room notifier threw closing sockets of Event ${eventId}`, error)
  })
  keepRunningAfterResponse(sent)
}

/**
 * The room notifier of this request: the one a test put into the context, else the real one when the Worker's
 * address and the internal secret are set, else one that does nothing and leaves the page to its polling.
 */
export function useRoomNotifier(event: H3Event): RoomNotifier {
  if (event.context.roomNotifier) return event.context.roomNotifier
  const url = realtimeUrl()
  const secret = process.env.ROOM_INTERNAL_SECRET
  return url && secret ? httpRoomNotifier({ url, secret }) : { async publish() {}, async close() {} }
}
