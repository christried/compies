import { defineEventHandler, getRouterParam } from 'h3'
import { pollVotes } from '../../../../../db/schema'
import { parseNote, parseVoteValue, voteRejection } from '../../../../../domain/poll'
import type { AuthUser } from '../../../../../../shared/auth'
import type { SavedVote } from '../../../../../../shared/event'
import { asRecord } from '../../../../../../shared/record'
import { useClock } from '../../../../../utils/clock'
import { apiError, slotNotFound } from '../../../../../utils/errors'
import { createRateLimiter } from '../../../../../utils/rate-limit'
import { changeEvent } from '../../../../../utils/event-access'
import { missingDates } from '../../../../../domain/session'
import { eventSessions, isSlotTaken } from '../../../../../utils/sessions'
import { findSlot } from '../../../../../utils/slots'

// About 30 votes per User per minute (#1 § Polling). In memory, so the limit holds per instance.
const voteLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 })

// Put a Vote (ADR 0001, #1 § Domain rules). Members only; the Slot must belong to this Event, the
// Date poll must be open (datePollOpen: a Session waits for a Date, in the poll or a running Event, #164), and the Slot must not be past. A Vote can be changed but not taken back, so
// a second Vote on the same Slot replaces the first.
// The checks and the write share one transaction with a shared lock on the Event row. Slot edits
// (FOR UPDATE) and phase changes (UPDATE) wait for it and it waits for them, so a Vote cannot land on
// a Slot that was just removed, or after the Date was set. Votes do not block each other.
// A Note rides along (#102): a missing `note` keeps the stored one, "" removes it.
// The limit applies before the body is read, as soon as the User is known (changeEvent's beforeBody).
function limitVotes(user: AuthUser) {
  if (!voteLimiter.take(user.id, new Date())) throw apiError('rate_limited')
}

export default defineEventHandler((event): Promise<SavedVote> => changeEvent(event, { lock: 'share', beforeBody: limitVotes }, async ({ tx, eventRow, user, body }) => {
  const { value: rawValue, note: rawNote } = asRecord(body)
  const value = parseVoteValue(rawValue)
  if (!value) throw apiError('invalid_value')
  const parsed = parseNote(rawNote)
  if (!parsed.ok) throw apiError(parsed.error)
  const note = parsed.note

  const slot = await findSlot(tx, eventRow.id, getRouterParam(event, 'slotId') ?? '')
  if (!slot) throw slotNotFound()

  const taken = await isSlotTaken(tx, eventRow.id, slot.id)
  const waiting = missingDates((await eventSessions(tx, eventRow.id)).map(row => row.startsAt))
  const rejection = voteRejection({ phase: eventRow.phase, missingDates: waiting, startsAt: slot.startsAt, now: useClock(event).now(), taken })
  if (rejection) throw apiError(rejection)

  const [saved] = await tx
    .insert(pollVotes)
    .values({ slotId: slot.id, userId: user.id, value, note: note ?? null })
    .onConflictDoUpdate({
      target: [pollVotes.slotId, pollVotes.userId],
      set: { value, updatedAt: useClock(event).now(), ...(note !== undefined && { note }) },
    })
    .returning({ note: pollVotes.note })

  return { slotId: slot.id, value, note: saved!.note }
}))
