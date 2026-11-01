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

/**
 * Records the messages per Event, for tests (like the in-memory image store). `messages` returns every message of an
 * Event, broadcast and named alike; `sends` keeps each call with its named Users (#227).
 * @public Only tests call it, so knip would report it; the test doubles live next to the interface they stand in for.
 */
export function memoryRoomNotifier(): RoomNotifier & { messages(eventId: string): Envelope[], sends(eventId: string): RoomSend[], clear(): void } {
  const sent = new Map<string, RoomSend[]>()
  return {
    async publish(eventId, messages, to) {
      if (messages.length === 0 || to?.length === 0) return
      sent.set(eventId, [...(sent.get(eventId) ?? []), { to: to ? [...to] : null, messages }])
    },
    messages: eventId => (sent.get(eventId) ?? []).flatMap(send => send.messages),
    sends: eventId => sent.get(eventId) ?? [],
    clear: () => sent.clear(),
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
  return {
    async publish(eventId, messages, to) {
      if (messages.length === 0 || to?.length === 0) return
      try {
        const body = JSON.stringify((to ? { to: [...to], direct: messages } : { messages }) satisfies RoomPublishBody)
        const call = await signRoomCall(body, secret, now())
        const response = await send(new URL(roomPath(eventId), url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [ROOM_CALL_TIMESTAMP_HEADER]: call.timestamp,
            [ROOM_CALL_SIGNATURE_HEADER]: call.signature,
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) console.error(`Room publish for Event ${eventId} was refused: ${response.status}`)
      }
      catch (error) {
        console.error(`Room publish for Event ${eventId} failed`, error)
      }
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

/**
 * The room notifier of this request: the one a test put into the context, else the real one when the Worker's
 * address and the internal secret are set, else one that does nothing and leaves the page to its polling.
 */
export function useRoomNotifier(event: H3Event): RoomNotifier {
  if (event.context.roomNotifier) return event.context.roomNotifier
  const url = realtimeUrl()
  const secret = process.env.ROOM_INTERNAL_SECRET
  return url && secret ? httpRoomNotifier({ url, secret }) : { async publish() {} }
}
