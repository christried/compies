import { and, eq, isNull } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { pollSlots, pollVotes, sessionMembers, sessions } from '../../../../../db/schema'
import { parseVoteValue, voteRejection } from '../../../../../domain/poll'
import { createRateLimiter } from '../../../../../domain/rate-limit'
import { useDb } from '../../../../../utils/db'
import { requireUser } from '../../../../../utils/user'

// About 30 votes per User per minute (#1 § Polling). In memory, so the limit holds per instance.
const voteLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Put a Vote (ADR 0001, #1 § Domain rules). Members only; the Slot must belong to this Session, the
// Phase must be `poll`, and the Slot must not be past. A Vote can be changed but not taken back, so
// a second Vote on the same Slot replaces the first.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!voteLimiter.take(user.id, new Date())) {
    throw createError({ statusCode: 429, statusMessage: 'Too many votes' })
  }

  const slug = getRouterParam(event, 'slug') ?? ''
  const slotId = getRouterParam(event, 'slotId') ?? ''
  const notFound = (message: string) => createError({ statusCode: 404, statusMessage: message })

  const body = await readBody<{ value?: unknown } | null>(event)
  const value = parseVoteValue(body?.value)
  if (!value) throw createError({ statusCode: 400, statusMessage: 'invalid_value' })

  const db = useDb(event)
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.slug, slug), isNull(sessions.deletedAt)))
  if (!session) throw notFound('Session not found')

  const [member] = await db
    .select({ userId: sessionMembers.userId })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, session.id), eq(sessionMembers.userId, user.id)))
  if (!member) throw notFound('Session not found')

  const [slot] = UUID.test(slotId)
    ? await db
        .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
        .from(pollSlots)
        .where(and(eq(pollSlots.id, slotId), eq(pollSlots.sessionId, session.id)))
    : []
  if (!slot) throw notFound('Slot not found')

  const rejection = voteRejection({ phase: session.phase, startsAt: slot.startsAt, now: new Date() })
  if (rejection === 'wrong_phase') throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
  if (rejection === 'slot_past') throw createError({ statusCode: 400, statusMessage: 'slot_past' })

  await db
    .insert(pollVotes)
    .values({ slotId: slot.id, userId: user.id, value })
    .onConflictDoUpdate({
      target: [pollVotes.slotId, pollVotes.userId],
      set: { value, updatedAt: new Date() },
    })

  return { slotId: slot.id, value }
})
