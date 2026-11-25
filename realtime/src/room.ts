import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver'
import { EMOTE_COOLDOWN_MS, EMOTE_SOUND_WINDOW_MS, isEmoteId, judgeEmote, type EmoteId } from '../../shared/emote'
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
  /** The room closed this socket, for its silence (the sweep) or on Nuxt's call to cut off its User (#913), and has already told the others; it no longer counts as online. */
  dropped?: boolean
}

/**
 * One room per Event, named by the Event id (ADR 0012, ADR 0013). It holds sockets and fans messages out; it keeps no
 * Event state, so nothing is lost when it hibernates or the Worker is deployed. Nuxt decides everything and tells
 * the room what to send through the Worker's signed publish call. The room's own messages are presence (#162: who
 * is online, derived from the open sockets so it survives hibernation), the clock (`clock.pong`) and, from 0.18
 * (#767), the Emote: `emote.send` is passed on as `emote.sent` to every socket, under the first two rules the room
 * holds (one Emote per Member every two seconds, at most three a second that carry a sound), whose counters live in
 * its memory only. The room still keeps no Event state and no schedule, so a hibernation or a deploy loses only those
 * counters; anything else a client sends is ignored. Nuxt's publish reaches every socket, or only the sockets of named
 * Users (#227, sealed Vetoes), and the room keeps no Event state either way. On Nuxt's signed call it can also send
 * last messages to the sockets of named Users and close them (#913, ADR 0013, amendment of 2026-11-20): Nuxt decides
 * who is no Member any more; the room keeps no list of Members and only does what the call says.
 */
export class EventRoom extends Server {
  static options = { hibernate: true }

  /** The accepted Emote times of each Member (by user, so two sockets share them), kept for the Member's cooldown. */
  #emoteTimes = new Map<string, number[]>()
  /** The times of the accepted Emotes of the whole room that carried a sound, kept for the sound window. */
  #soundTimes: number[] = []

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

  onMessage(connection: Connection<RoomConnectionState>, message: WSMessage): void {
    // Moves, words and Session actions are HTTP calls to Nuxt, never socket messages (spec #153 § Protocol); the Emote is the one exception (ADR 0013, amendment of 2026-11-16).
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
    else if (isRecord(parsed) && parsed.type === 'emote.send' && isEmoteId(parsed.emote)) {
      this.#emote(connection, parsed.emote)
    }
  }

  /**
   * Passes a Member's Emote on to every socket, the sender's included, when both rules allow it (#767). The sender is
   * the user of the socket's token, never a field of the message. A refused Emote is dropped without an answer and
   * without being recorded, so it does not extend the Member's wait. The counters are plain fields: a hibernation resets them.
   */
  #emote(connection: Connection<RoomConnectionState>, emote: EmoteId) {
    const state = connection.state
    if (!state?.sub || state.dropped) return
    const now = Date.now()
    this.#soundTimes = this.#soundTimes.filter(time => now - time < EMOTE_SOUND_WINDOW_MS)
    for (const [sub, times] of this.#emoteTimes) {
      const recent = times.filter(time => now - time < EMOTE_COOLDOWN_MS)
      if (recent.length > 0) this.#emoteTimes.set(sub, recent)
      else this.#emoteTimes.delete(sub)
    }
    const verdict = judgeEmote({ member: this.#emoteTimes.get(state.sub) ?? [], sounded: this.#soundTimes }, now)
    if (!verdict.allowed) return
    this.#emoteTimes.set(state.sub, [...this.#emoteTimes.get(state.sub) ?? [], now])
    if (verdict.sound) this.#soundTimes.push(now)
    this.#broadcast({ type: 'emote.sent', userId: state.sub, emote, sound: verdict.sound })
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

  /**
   * The signed publish call, already verified by the Worker: send each message to every socket of this Event, or, with
   * `to` (#227), to the sockets of the named Users only; or, with `close` and `last` (#913), send `last` to the sockets
   * of the named Users and close them. A body that is none of the three shapes is refused with nothing sent or closed.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    let body: unknown
    try {
      body = await request.json()
    }
    catch {
      return new Response('Bad request', { status: 400 })
    }
    const call = publishCall(body)
    if (!call || !call.messages.every(isEnvelope)) return new Response('Bad request', { status: 400 })
    if (call.kind === 'close') {
      this.#closeUsers(call.users, call.messages)
      return new Response(null, { status: 204 })
    }
    if (call.to === null) {
      for (const message of call.messages) this.broadcast(JSON.stringify(message))
      return new Response(null, { status: 204 })
    }
    for (const connection of this.getConnections<RoomConnectionState>()) {
      const state = connection.state
      if (!state || state.dropped || !call.to.includes(state.sub)) continue
      for (const message of call.messages) connection.send(JSON.stringify(message))
    }
    return new Response(null, { status: 204 })
  }

  /**
   * Nuxt's call to cut off named Users (#913): each of their sockets gets the last messages and is closed, and the
   * others hear one leave per User. The sockets are marked `dropped` first, as the sweep does, so the User is offline
   * at once, `onClose` says nothing a second time and the Emote of a closing socket is refused. Everything comes from
   * the sockets, so it holds after a hibernation. The room does not look inside the messages (CODING_STANDARDS § Secrecy).
   */
  #closeUsers(users: string[], messages: unknown[]) {
    const doomed: Connection<RoomConnectionState>[] = []
    for (const connection of this.getConnections<RoomConnectionState>()) {
      const state = connection.state
      if (state && !state.dropped && state.sub && users.includes(state.sub)) doomed.push(connection)
    }
    for (const connection of doomed) connection.setState(state => ({ ...state!, dropped: true }))
    for (const connection of doomed) {
      for (const message of messages) connection.send(JSON.stringify(message))
    }
    const online = this.#online()
    const doomedIds = doomed.map(connection => connection.id)
    for (const sub of new Set(doomed.map(connection => connection.state?.sub))) {
      if (sub && !online.has(sub)) this.#broadcast({ type: 'presence.leave', userId: sub }, doomedIds)
    }
    for (const connection of doomed) connection.close(1008, 'Not a Member')
  }
}

/** A message is an envelope of this protocol version with a type. */
function isEnvelope(message: unknown): boolean {
  return isRecord(message) && message.v === ROOM_PROTOCOL_VERSION && typeof message.type === 'string'
}

/**
 * The shape of a publish call: a send (to every socket, or with `to` to the named Users) or, from #913, the sockets of
 * the Users in `users` closed after `messages`. Exactly one of the three groups of keys (`messages`; `to` and `direct`;
 * `close` and `last`) may be present: a body that mixes them is null, so no key can turn one shape into another.
 */
type PublishCall = { kind: 'send', to: string[] | null, messages: unknown[] } | { kind: 'close', users: string[], messages: unknown[] }

function publishCall(body: unknown): PublishCall | null {
  if (!isRecord(body)) return null
  const groups = [['messages'], ['to', 'direct'], ['close', 'last']].filter(keys => keys.some(key => key in body))
  if (groups.length !== 1) return null
  if ('messages' in body) {
    return 'to' in body || 'direct' in body || !Array.isArray(body.messages) ? null : { kind: 'send', to: null, messages: body.messages }
  }
  if ('close' in body || 'last' in body) {
    const { close, last } = body
    if (!Array.isArray(close) || !close.every(id => typeof id === 'string') || !Array.isArray(last)) return null
    return { kind: 'close', users: close, messages: last }
  }
  const { to, direct } = body
  if (!Array.isArray(to) || !to.every(id => typeof id === 'string') || !Array.isArray(direct)) return null
  return { kind: 'send', to, messages: direct }
}
