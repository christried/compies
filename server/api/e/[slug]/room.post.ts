import { defineEventHandler, getRouterParam } from 'h3'
import { ROOM_TOKEN_TTL_SECONDS, signRoomToken } from '../../../../shared/room-auth'
import type { RoomTicket } from '../../../../shared/realtime'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { realtimeUrl } from '../../../utils/room-notifier'
import { requireUser } from '../../../utils/user'

// The room token (#156, ADR 0012): a Member trades their login for a token that opens this Event's room on the
// Worker for 60 seconds. The Worker checks it once, at connect; the client asks again for every (re)connect.
// Same answers as the Event link (ADR 0006): a stranger gets the 404 of a missing Event, a signed-out User the 401.
// A deployment without a Worker answers no_live_connection, which the client takes as "poll instead".
export default defineEventHandler(async (event): Promise<RoomTicket> => {
  const user = await requireUser(event)
  const eventRow = await loadEvent(useDb(event), getRouterParam(event, 'slug') ?? '', user.id)

  const url = realtimeUrl()
  const secret = process.env.ROOM_TOKEN_SECRET
  if (!url || !secret) throw apiError('no_live_connection')

  const exp = Math.floor(Date.now() / 1000) + ROOM_TOKEN_TTL_SECONDS
  const token = await signRoomToken({ sub: user.id, evt: eventRow.id, host: eventRow.hostId === user.id, exp, jti: crypto.randomUUID() }, secret)
  return { url, room: eventRow.id, token }
})
