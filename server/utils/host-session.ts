import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { sessions } from '../db/schema'
import { slotsEditable } from '../domain/session'
import { isMember, sessionNotFound } from './invite'
import type { Db } from './db'

// Loads the Session a Host edits Slots in (#15). Runs inside the caller's transaction and locks the
// Session row, so two edits of one Session queue up and the 8-Slot limit holds. Same answers as the
// Session link (ADR 0006): a non-Member gets the generic 404, a former Member of a deleted Session 410.
// Only the Host of this Session may edit its Slots (#1 § Domain rules), and only while the Phase is poll.
export async function lockSessionForSlotEdit(tx: Db, slug: string, userId: string) {
  const [session] = await tx.select().from(sessions).where(eq(sessions.slug, slug)).for('update')
  if (!session) throw sessionNotFound()
  if (!await isMember(tx, session.id, userId)) throw sessionNotFound()
  if (session.deletedAt) throw createError({ statusCode: 410, statusMessage: 'Session deleted' })
  if (session.hostId !== userId) throw createError({ statusCode: 403, statusMessage: 'Host only' })
  if (!slotsEditable(session.phase)) throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
  return session
}
