import { apiFailure } from '~/utils/api-error'
import { ROOM_PROTOCOL_VERSION, type Envelope, type RoomMessage, type RoomMessageType, type RoomTicket } from '~~/shared/realtime'
import { asRecord } from '~~/shared/record'

// The live connection of an Event page to its room (#156, ADR 0012). It connects only where the app knows a Worker
// (public runtime config `realtimeUrl`), asks Nuxt for a fresh 60-second token before every (re)connect, and hands the
// room's messages to whoever listens with `on`. The room says what happened, Nuxt decides what is true: the page
// reacts by refetching the Event read (useEventView). Nothing here runs on the server.

export type RoomState = 'connecting' | 'open' | 'closed'

type MessageOf<T extends RoomMessageType> = Envelope<Extract<RoomMessage, { type: T }>>

/** How long to wait before asking for a first token again, when the token endpoint could not be reached. */
export const TICKET_RETRY_MS = 5000

export function useEventRoom(slug: MaybeRefOrGetter<string>) {
  const enabled = Boolean(useRuntimeConfig().public.realtimeUrl)
  const state = ref<RoomState>(enabled ? 'connecting' : 'closed')
  const handlers = new Map<string, Set<(message: Envelope) => void>>()

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
      // A refusal (not a Member any more, no Worker here) will not change by asking again; a network failure may.
      const status = apiFailure(failure).status ?? 0
      if (status < 400 || status >= 500) retryTimer = setTimeout(start, TICKET_RETRY_MS)
      return
    }
    if (disposed) return

    // The first connect uses the token it just got; every later (re)connect asks for a new one.
    let unused: RoomTicket | null = first
    socket = createRoomSocket({
      url: first.url,
      room: first.room,
      token: async () => {
        const ticket = unused ?? await askForTicket()
        unused = null
        return ticket.token
      },
      onOpen: () => void (state.value = 'open'),
      onClose: () => void (state.value = 'closed'),
      onMessage: receive,
    })
  }

  /** Tries again at once, e.g. from the banner's „Neu verbinden“. */
  function retry() {
    if (!enabled) return
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
    onScopeDispose(() => {
      disposed = true
      clearTimeout(retryTimer)
      socket?.close()
    })
  }

  return { enabled, state: readonly(state), retry, on }
}
