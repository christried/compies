import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver'
import { isRecord } from '../../shared/record'
import { HEARTBEAT_PING, HEARTBEAT_PONG, ROOM_PROTOCOL_VERSION, SILENT_AFTER_MS, envelope, type RoomMessage } from '../../shared/realtime'

/** What the Worker's `fetch` sets on a connect request after it checked the token. The room trusts it because it is reachable only through that `fetch`. */
export const ROOM_USER_HEADER = 'x-room-sub'
export const ROOM_HOST_HEADER = 'x-room-host'

/** How often the alarm looks for sockets without a heartbeat, while any socket is open. */
export const SWEEP_EVERY_MS = 10_000

/** Who a socket belongs to. PartyServer keeps it in the socket's attachment, so it survives hibernation. */
export interface RoomConnectionState {
  sub: string
  host: boolean
  /** When the socket opened (ms since the epoch): the last sign of life of a socket that never sent a heartbeat. */
  connectedAt: number
  /** The sweep closed this socket for its silence and has already told the others; it no longer counts as online. */
  dropped?: boolean
}

/**
 * One room per Event, named by the Event id (ADR 0012, ADR 0013). It holds sockets and fans messages out; it keeps no
 * Event state, so nothing is lost when it hibernates or the Worker is deployed. Nuxt decides everything and tells
 * the room what to send through the Worker's signed publish call. The room's own messages are presence (#162: who
 * is online, derived from the open sockets so it survives hibernation) and the clock (`clock.pong`); what else a
 * client sends is ignored.
 */
export class EventRoom extends Server {
  static options = { hibernate: true }

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    // The heartbeat is answered by the runtime without waking the room, and it records when each socket last sent one.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG))
  }

  /** The users with an open socket that is not the one named `except`, read from the sockets themselves. */
  #online(except?: string): Set<string> {
    const users = new Set<string>()
    for (const connection of this.getConnections<RoomConnectionState>()) {
      const state = connection.state
      if (connection.id !== except && state && !state.dropped && state.sub) users.add(state.sub)
    }
    return users
  }

  #send(connection: Connection, message: RoomMessage) {
    connection.send(JSON.stringify(envelope(message, Date.now())))
  }

  #broadcast(message: RoomMessage, without?: string[]) {
    this.broadcast(JSON.stringify(envelope(message, Date.now())), without)
  }

  async onConnect(connection: Connection<RoomConnectionState>, { request }: ConnectionContext): Promise<void> {
    const sub = request.headers.get(ROOM_USER_HEADER) ?? ''
    connection.setState({ sub, host: request.headers.get(ROOM_HOST_HEADER) === 'true', connectedAt: Date.now() })

    const others = this.#online(connection.id)
    this.#send(connection, { type: 'presence.sync', userIds: [...new Set([...others, sub])] })
    if (sub && !others.has(sub)) this.#broadcast({ type: 'presence.join', userId: sub }, [connection.id])
    await this.#keepSweeping()
  }

  onMessage(connection: Connection, message: WSMessage): void {
    // Moves, words and Session actions are HTTP calls to Nuxt, never socket messages (spec #153 § Protocol).
    if (typeof message !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    }
    catch {
      return
    }
    if (isRecord(parsed) && parsed.type === 'clock.ping' && typeof parsed.t0 === 'number' && Number.isFinite(parsed.t0)) {
      this.#send(connection, { type: 'clock.pong', t0: parsed.t0 })
    }
  }

  onClose(connection: Connection<RoomConnectionState>): void {
    this.#left(connection)
  }

  onError(connection: Connection<RoomConnectionState>): void {
    this.#left(connection)
  }

  /** A socket is gone: when it was the user's last, the others hear that they left. The client ignores a leave it already heard. */
  #left(connection: Connection<RoomConnectionState>) {
    const state = connection.state
    if (!state?.sub || state.dropped) return
    if (!this.#online(connection.id).has(state.sub)) this.#broadcast({ type: 'presence.leave', userId: state.sub })
  }

  /** Makes sure an alarm is set: the sweep runs by alarm, not by timer, so the room can hibernate between sweeps. */
  async #keepSweeping() {
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_EVERY_MS)
  }

  /**
   * Closes every socket that has been silent for SILENT_AFTER_MS (the last heartbeat the runtime answered, else the
   * moment it connected) and says who went offline. A server-side close of a dead client may never reach
   * `onClose`, so the leaves are worked out here; the marker keeps `onClose` from sending a second one.
   */
  async onAlarm(): Promise<void> {
    const now = Date.now()
    const silent: Connection<RoomConnectionState>[] = []
    let open = 0
    for (const connection of this.getConnections<RoomConnectionState>()) {
      const state = connection.state
      if (!state || state.dropped) continue
      const lastSeen = Math.max(state.connectedAt, this.ctx.getWebSocketAutoResponseTimestamp(connection)?.getTime() ?? 0)
      if (now - lastSeen > SILENT_AFTER_MS) silent.push(connection)
      else open += 1
    }
    for (const connection of silent) connection.setState(state => ({ ...state!, dropped: true }))
    const online = this.#online()
    for (const sub of new Set(silent.map(connection => connection.state?.sub))) {
      if (sub && !online.has(sub)) this.#broadcast({ type: 'presence.leave', userId: sub })
    }
    for (const connection of silent) connection.close(1001, 'Silent')
    if (open > 0) await this.ctx.storage.setAlarm(now + SWEEP_EVERY_MS)
  }

  /** The signed publish call, already verified by the Worker: send each message to every socket of this Event. */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    let body: unknown
    try {
      body = await request.json()
    }
    catch {
      return new Response('Bad request', { status: 400 })
    }
    const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : null
    if (!messages || !messages.every(message => isRecord(message) && message.v === ROOM_PROTOCOL_VERSION && typeof message.type === 'string')) {
      return new Response('Bad request', { status: 400 })
    }
    for (const message of messages) this.broadcast(JSON.stringify(message))
    return new Response(null, { status: 204 })
  }
}
