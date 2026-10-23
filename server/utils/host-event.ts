import { slotsEditable } from '../domain/event'
import { apiError } from './errors'
import { loadEvent } from './event-access'
import type { Db } from './db'

// Loads the Event a Host edits Slots in (#15). Runs inside the caller's transaction and locks the
// Event row, so two edits of one Event queue up and the 8-Slot limit holds; Votes wait for the
// edit too. Same answers as the Event link (ADR 0006). Only the Host of this Event may edit its
// Slots (#1 § Domain rules), and only while the Phase is poll.
export async function lockEventForSlotEdit(tx: Db, slug: string, userId: string) {
  const event = await loadEvent(tx, slug, userId, { hostOnly: true, lock: 'update' })
  if (!slotsEditable(event.phase)) throw apiError('wrong_phase')
  return event
}
