import { eq } from 'drizzle-orm'
import { sessions } from '../db/schema'
import { sessionAccessRejection } from '../domain/access'
import { apiError, sessionDeleted, sessionNotFound } from './errors'
import { isMember } from './invite'
import type { Db } from './db'

export type SessionRow = typeof sessions.$inferSelect

export interface LoadSessionOptions {
  /** Only the Host of this Session may go on; other Members get 403 not_host. */
  hostOnly?: boolean
  /**
   * Lock the Session row for the caller's transaction. `update` for writes that must queue up (Slot
   * edits); `share` for writes that only need the Session to hold still (Votes).
   */
  lock?: 'update' | 'share'
}

/**
 * The Session a signed-in User opens by its slug, after the access rule (server/domain/access.ts):
 * 404 for unknown slugs and non-Members alike, 410 for a former Member of a deleted Session, 403
 * not_host for a host-only request by another Member. Phase rules stay with each handler.
 */
export async function loadSession(db: Db, slug: string, userId: string, options: LoadSessionOptions = {}): Promise<SessionRow> {
  const query = db.select().from(sessions).where(eq(sessions.slug, slug))
  const [session] = options.lock ? await query.for(options.lock) : await query
  const member = session ? await isMember(db, session.id, userId) : false

  const rejection = sessionAccessRejection({ session: session ?? null, isMember: member, userId, hostOnly: options.hostOnly ?? false })
  if (rejection === 'not_found') throw sessionNotFound()
  if (rejection === 'deleted') throw sessionDeleted()
  if (rejection === 'not_host') throw apiError('not_host')
  return session!
}
