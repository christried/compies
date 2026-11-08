import { and, eq, isNull } from 'drizzle-orm'
import { createError, defineEventHandler, getRequestHeader } from 'h3'
import { type CheckedSession, deployCheck, type DeployCheck } from '../../domain/game-day'
import { numberedSessions } from '../../domain/session'
import { events, sessions } from '../../db/schema'
import { isRunning } from '../../../shared/session-state'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, verifyRoomCall } from '../../../shared/room-auth'
import { useClock } from '../../utils/clock'
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
    .select({ eventId: sessions.eventId, slug: events.slug, id: sessions.id, startsAt: sessions.startsAt, startedAt: sessions.startedAt, endedAt: sessions.endedAt })
    .from(sessions)
    .innerJoin(events, eq(events.id, sessions.eventId))
    .where(and(isNull(events.deletedAt), sessionNotRemoved))
  // A removed Session and a deleted Event are left out by the query. The answer names each blocking Session as the
  // Event page does („Session 2 of `slug`“, retro 0.9), so the Sessions are numbered per Event the same way.
  const byEvent = new Map<string, typeof rows>()
  for (const row of rows) byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row])
  const checked: CheckedSession[] = [...byEvent.values()].flatMap(ofEvent => numberedSessions(ofEvent).map(row => ({
    event: row.slug,
    number: row.number,
    startsAt: row.startsAt,
    // A Running Session (#164) is started and not ended; it counts while it started less than 16 h ago (#200), so a
    // Session nobody ended stops blocking the deploy.
    runningSince: isRunning(row) ? row.startedAt : null,
  })))
  return deployCheck({ sessions: checked, now: useClock(event).now() })
})
