import { apiFailure } from '~/utils/api-error'
import { ROOM_PROTOCOL_VERSION, type ClientMessage, type Envelope, type RoomMessage, type RoomMessageType, type RoomTicket } from '~~/shared/realtime'
import { asRecord } from '~~/shared/record'

// The live connection of an Event page to its room (#156, ADR 0012). It connects only where the app knows a Worker
// (public runtime config `realtimeUrl`), asks Nuxt for a fresh 60-second token before every (re)connect, and hands the
// room's messages to whoever listens with `on`. The room says what happened, Nuxt decides what is true: the page
// reacts by refetching the Event read (useEventView). Presence and the clock ride on the same socket (#162): `send` says
// something to the room while it is open, `onAny` hears every message. Nothing here runs on the server.

export type RoomState = 'connecting' | 'open' | 'closed'

type MessageOf<T extends RoomMessageType> = Envelope<Extract<RoomMessage, { type: T }>>

/** How long to wait before asking for a first token again, when the token endpoint could not be reached. */
export const TICKET_RETRY_MS = 5000

/**
 * The answers of the token endpoint that will not change by asking again: not signed in, not a Member any more, the Event gone (#681, #993). Any other
 * status (a timeout, a rate limit, a 5xx) or a network failure (no status) is asked again.
 */
const TICKET_REFUSALS = [401, 403, 404, 410]
const refusesTicket = (status: number) => TICKET_REFUSALS.includes(status)

export function useEventRoom(slug: MaybeRefOrGetter<string>) {
  const enabled = Boolean(useRuntimeConfig().public.realtimeUrl)
  const state = ref<RoomState>(enabled ? 'connecting' : 'closed')
  const handlers = new Map<string, Set<(message: Envelope) => void>>()
  const anyHandlers = new Set<(message: Envelope) => void>()

  let socket: RoomSocket | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  /** Listens to one message type; returns the function that stops listening. */
  function on<T extends RoomMessageType>(type: T, handler: (message: MessageOf<T>) => void): () => void {
    const set = handlers.get(type) ?? new Set()
    handlers.set(type, set)
    // The set holds handlers of every type; this one is only called with its own.
    const stored = handler as (message: Envelope) => void
    set.add(stored)
    return () => void set.delete(stored)
  }

  /** Listens to every message, whatever its type (the server clock reads their `serverTime`); returns the function that stops listening. */
  function onAny(handler: (message: Envelope) => void): () => void {
    anyHandlers.add(handler)
    return () => void anyHandlers.delete(handler)
  }

  /** Says something to the room; nothing happens while the connection is not open. */
  function send(message: ClientMessage) {
    if (state.value === 'open') socket?.send(JSON.stringify(message))
  }

  function receive(data: string) {
    let message: unknown
    try {
      message = JSON.parse(data)
    }
    catch {
      return
    }
    const { v, type } = asRecord(message)
    if (v !== ROOM_PROTOCOL_VERSION || typeof type !== 'string') return
    for (const handler of anyHandlers) handler(message as Envelope)
    for (const handler of handlers.get(type) ?? []) handler(message as Envelope)
  }

  const askForTicket = () => $fetch<RoomTicket>(`/api/e/${toValue(slug)}/room`, { method: 'POST' })

  async function start() {
    state.value = 'connecting'
    let first: RoomTicket
    try {
      first = await askForTicket()
    }
    catch (failure) {
      if (disposed) return
      state.value = 'closed'
      // A refusal (not a Member any more, no Worker here) will not change by asking again; a network failure or a 408 or 429 may.
      const status = apiFailure(failure).status ?? 0
      if (!refusesTicket(status)) retryTimer = setTimeout(start, TICKET_RETRY_MS)
      return
    }
    if (disposed) return

    // The first connect uses the token it just got; every later (re)connect asks for a new one.
    let unused: RoomTicket | null = first
    socket = createRoomSocket({
      url: first.url,
      room: first.room,
      token: async () => {
        // A stopped room asks for nothing: a socket PartySocket still has in flight finds no ticket.
        if (disposed) throw new Error('The room is stopped')
        let ticket = unused
        if (!ticket) {
          try {
            ticket = await askForTicket()
          }
          catch (failure) {
            // A refusal (not a Member any more, the Event gone) will not change by asking again, and PartySocket would ask for ever (#681): stop for good.
            // Any other failure (a 408, a 429, a 5xx, a network failure) is thrown on and PartySocket tries again (#993).
            const status = apiFailure(failure).status ?? 0
            if (refusesTicket(status)) stop()
            throw failure
          }
        }
        unused = null
        return ticket.token
      },
      onOpen: () => void (state.value = 'open'),
      onClose: () => void (state.value = 'closed'),
      onMessage: receive,
    })
  }

  /** Closes the room for good: no reconnect and no token after this (the Event is gone for the page, #914). */
  function stop() {
    disposed = true
    clearTimeout(retryTimer)
    socket?.close()
    state.value = 'closed'
  }

  /** Tries again at once, e.g. from the banner's „Neu verbinden“. */
  function retry() {
    if (!enabled || disposed) return
    state.value = 'connecting'
    if (socket) {
      socket.reconnect()
      return
    }
    clearTimeout(retryTimer)
    void start()
  }

  if (import.meta.client) {
    onMounted(() => {
      if (enabled) void start()
    })
    onScopeDispose(stop)
  }

  return { enabled, state: readonly(state), retry, stop, on, onAny, send }
}
