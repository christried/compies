import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { pollVotes } from '../../../../../db/schema'
import { parseVoteValue, voteRejection } from '../../../../../domain/poll'
import { useDb } from '../../../../../utils/db'
import { apiError, slotNotFound } from '../../../../../utils/errors'
import { createRateLimiter } from '../../../../../utils/rate-limit'
import { loadEvent } from '../../../../../utils/event-access'
import { findSlot } from '../../../../../utils/slots'
import { requireUser } from '../../../../../utils/user'

// About 30 votes per User per minute (#1 § Polling). In memory, so the limit holds per instance.
const voteLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })

// Put a Vote (ADR 0001, #1 § Domain rules). Members only; the Slot must belong to this Event, the
// Phase must be `poll`, and the Slot must not be past. A Vote can be changed but not taken back, so
// a second Vote on the same Slot replaces the first.
// The checks and the write share one transaction with a shared lock on the Event row. Slot edits
// (FOR UPDATE) and phase changes (UPDATE) wait for it and it waits for them, so a Vote cannot land on
// a Slot that was just removed, or after the Date was set. Votes do not block each other.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!voteLimiter.take(user.id, new Date())) throw apiError('rate_limited')

  const slug = getRouterParam(event, 'slug') ?? ''
  const slotId = getRouterParam(event, 'slotId') ?? ''

  const body = await readBody<{ value?: unknown } | null>(event)
  const value = parseVoteValue(body?.value)
  if (!value) throw apiError('invalid_value')

  return useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, { lock: 'share' })
    const slot = await findSlot(tx, eventRow.id, slotId)
    if (!slot) throw slotNotFound()

    const rejection = voteRejection({ phase: eventRow.phase, startsAt: slot.startsAt, now: new Date() })
    if (rejection) throw apiError(rejection)

    await tx
      .insert(pollVotes)
      .values({ slotId: slot.id, userId: user.id, value })
      .onConflictDoUpdate({
        target: [pollVotes.slotId, pollVotes.userId],
        set: { value, updatedAt: new Date() },
      })

    return { slotId: slot.id, value }
  })
})
