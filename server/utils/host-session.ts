import { slotsEditable } from '../domain/session'
import { apiError } from './errors'
import { loadSession } from './session-access'
import type { Db } from './db'

// Loads the Session a Host edits Slots in (#15). Runs inside the caller's transaction and locks the
// Session row, so two edits of one Session queue up and the 8-Slot limit holds; Votes wait for the
// edit too. Same answers as the Session link (ADR 0006). Only the Host of this Session may edit its
// Slots (#1 § Domain rules), and only while the Phase is poll.
export async function lockSessionForSlotEdit(tx: Db, slug: string, userId: string) {
  const session = await loadSession(tx, slug, userId, { hostOnly: true, lock: 'update' })
  if (!slotsEditable(session.phase)) throw apiError('wrong_phase')
  return session
}
