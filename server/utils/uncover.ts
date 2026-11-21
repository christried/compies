import { eq } from 'drizzle-orm'
import { events } from '../db/schema'
import type { WheelUncovered } from '../../shared/event'
import { apiError } from './errors'
import type { ChangeCore } from './event-access'
import { readEventState, uncoverReason } from './event-state'

// The Host uncovers the Hidden wheel (#957, spec #961 § Uncover): once every Round up to the Game count has its Result, while the Session runs.
// It runs under the Event lock (changeEvent, `lock: 'update'`), so a second press that waits finds the wheel uncovered (`wheel_uncovered`).
// The commit broadcasts the existing `event.changed`: every device refetches and reads the wheel as visible. No Activity entry (spec #961: no
// file of the Worker changes, and the feed's types are the Worker's).

/** Stores the uncover's instant when uncoverReason passes; refuses with its reason otherwise. Nothing is written before the rule passes. */
export async function uncoverWheel({ tx, eventRow, user, now }: Pick<ChangeCore, 'tx' | 'eventRow' | 'user' | 'now'>): Promise<WheelUncovered> {
  const rejection = uncoverReason(await readEventState(tx, eventRow, now, ['sessions', 'rounds']), eventRow.hostId === user.id)
  if (rejection) throw apiError(rejection)

  await tx.update(events).set({ wheelUncoveredAt: now }).where(eq(events.id, eventRow.id))
  return { uncoveredAt: now.toISOString() }
}
