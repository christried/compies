import { eq } from 'drizzle-orm'
import { events } from '../db/schema'
import { eventAccessRejection } from '../domain/access'
import { apiError, eventDeleted, eventNotFound } from './errors'
import { isMember } from './invite'
import type { Db } from './db'

export type EventRow = typeof events.$inferSelect

export interface LoadEventOptions {
  /** Only the Host of this Event may go on; other Members get 403 not_host. */
  hostOnly?: boolean
  /**
   * Lock the Event row for the caller's transaction. `update` for writes that must queue up (Slot
   * edits); `share` for writes that only need the Event to hold still (Votes).
   */
  lock?: 'update' | 'share'
}

/**
 * The Event a signed-in User opens by its slug, after the access rule (server/domain/access.ts):
 * 404 for unknown slugs and non-Members alike, 410 for a former Member of a deleted Event, 403
 * not_host for a host-only request by another Member. Phase rules stay with each handler.
 */
export async function loadEvent(db: Db, slug: string, userId: string, options: LoadEventOptions = {}): Promise<EventRow> {
  const query = db.select().from(events).where(eq(events.slug, slug))
  const [event] = options.lock ? await query.for(options.lock) : await query
  const member = event ? await isMember(db, event.id, userId) : false

  const rejection = eventAccessRejection({ event: event ?? null, isMember: member, userId, hostOnly: options.hostOnly ?? false })
  if (rejection === 'not_found') throw eventNotFound()
  if (rejection === 'deleted') throw eventDeleted()
  if (rejection === 'not_host') throw apiError('not_host')
  return event!
}
