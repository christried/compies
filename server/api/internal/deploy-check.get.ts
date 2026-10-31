import { and, eq, isNull } from 'drizzle-orm'
import { createError, defineEventHandler, getRequestHeader } from 'h3'
import { deployCheck, type DeployCheck } from '../../domain/game-day'
import { events, sessions } from '../../db/schema'
import { isRunning } from '../../../shared/board'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, verifyRoomCall } from '../../../shared/room-auth'
import { useDb } from '../../utils/db'
import { sessionNotRemoved } from '../../utils/sessions'

// The game-day guard of the Worker deploy (#157, #164, spec #153 § Deploys): the deploy workflow asks here before it
// replaces the production Worker, because a deploy drops every open socket. Signed like a call to a room (same scheme
// and keys, current and previous), so only the workflow can ask. Every refusal is the same 401.
export default defineEventHandler(async (event): Promise<DeployCheck> => {
  const signed = await verifyRoomCall({
    body: '',
    timestamp: getRequestHeader(event, ROOM_CALL_TIMESTAMP_HEADER) ?? null,
    signature: getRequestHeader(event, ROOM_CALL_SIGNATURE_HEADER) ?? null,
    secrets: [process.env.ROOM_INTERNAL_SECRET, process.env.ROOM_INTERNAL_SECRET_PREVIOUS].filter((key): key is string => !!key),
    now: Date.now(),
  })
  if (!signed) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const rows = await useDb(event)
    .select({ startsAt: sessions.startsAt, startedAt: sessions.startedAt, endedAt: sessions.endedAt })
    .from(sessions)
    .innerJoin(events, eq(events.id, sessions.eventId))
    .where(and(isNull(events.deletedAt), sessionNotRemoved))
  // A Running Session (#164) is started and not ended; a removed Session and a deleted Event are left out by the query.
  const running = rows.filter(isRunning).length
  return deployCheck({ startsAt: rows.map(row => row.startsAt), running, now: new Date() })
})
