import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver'
import { isRecord } from '../../shared/record'
import { ROOM_PROTOCOL_VERSION } from '../../shared/realtime'

/** What the Worker's `fetch` sets on a connect request after it checked the token. The room trusts it because it is reachable only through that `fetch`. */
export const ROOM_USER_HEADER = 'x-room-sub'
export const ROOM_HOST_HEADER = 'x-room-host'

/** Who a socket belongs to. PartyServer keeps it in the socket's attachment, so it survives hibernation. */
export interface RoomConnectionState {
  sub: string
  host: boolean
}

/**
 * One room per Event, named by the Event id (ADR 0012, ADR 0013). It holds sockets and fans messages out; it keeps no
 * Event state, so nothing is lost when it hibernates or the Worker is deployed. Nuxt decides everything and tells
 * the room what to send through the Worker's signed publish call. The room's own messages (presence, clock) come
 * with #162; until then it ignores what a client sends.
 */
export class EventRoom extends Server {
  static options = { hibernate: true }

  onConnect(connection: Connection<RoomConnectionState>, { request }: ConnectionContext): void {
    connection.setState({
      sub: request.headers.get(ROOM_USER_HEADER) ?? '',
      host: request.headers.get(ROOM_HOST_HEADER) === 'true',
    })
  }

  onMessage(_connection: Connection, _message: WSMessage): void {
    // Moves, words and Session actions are HTTP calls to Nuxt, never socket messages (spec #153 § Protocol).
  }

  /** The signed publish call, already verified by the Worker: send each message to every socket of this Event. */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    let body: unknown
    try {
      body = await request.json()
    } catch {
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
