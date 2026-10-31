import { routePartykitRequest } from 'partyserver'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, verifyRoomCall, verifyRoomToken } from '../../shared/room-auth'
import { ROOM_HOST_HEADER, ROOM_USER_HEADER } from './room'

export { EventRoom } from './room'

// The only way into a room (ADR 0012): the Durable Object has no route of its own, so everything a room trusts has
// passed these two checks. A socket needs an allowed Origin and a room token for this very Event; a publish needs a
// fresh signature from Nuxt. Both accept the previous key of a rotating secret.

const keys = (current: string | undefined, previous: string | undefined) => [current, previous].filter((key): key is string => !!key)

const refuse = (status: number) => new Response(status === 401 ? 'Unauthorized' : 'Forbidden', { status })

async function checkSocket(request: Request, room: string, env: Cloudflare.Env): Promise<Request | Response> {
  // Browsers apply no CORS to a WebSocket handshake, so the Origin allowlist is what keeps other sites out.
  const allowed = env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  const origin = request.headers.get('origin')
  if (!origin || !allowed.includes(origin)) return refuse(403)

  const token = new URL(request.url).searchParams.get('token')
  if (!token) return refuse(401)
  const verified = await verifyRoomToken(token, {
    secrets: keys(env.ROOM_TOKEN_SECRET, env.ROOM_TOKEN_SECRET_PREVIOUS),
    now: Date.now(),
    eventId: room,
  })
  if (!verified.ok) return refuse(401)

  // `set` replaces whatever the client sent under these names; the room reads them as the token's claims.
  const checked = new Request(request)
  checked.headers.set(ROOM_USER_HEADER, verified.claims.sub)
  checked.headers.set(ROOM_HOST_HEADER, String(verified.claims.host))
  return checked
}

async function checkPublish(request: Request, env: Cloudflare.Env): Promise<Response | void> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const signed = await verifyRoomCall({
    body: await request.clone().text(),
    timestamp: request.headers.get(ROOM_CALL_TIMESTAMP_HEADER),
    signature: request.headers.get(ROOM_CALL_SIGNATURE_HEADER),
    secrets: keys(env.ROOM_INTERNAL_SECRET, env.ROOM_INTERNAL_SECRET_PREVIOUS),
    now: Date.now(),
  })
  if (!signed) return refuse(401)
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const response = await routePartykitRequest(request, env, {
      // Rooms live in the EU jurisdiction (spec #153, ADR 0012). Local workerd cannot restrict one, so only the
      // deployed environments set JURISDICTION.
      jurisdiction: env.JURISDICTION,
      onBeforeConnect: (req, lobby) => checkSocket(req, lobby.name, env),
      onBeforeRequest: req => checkPublish(req, env),
    })
    return response ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Cloudflare.Env>
