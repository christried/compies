import { eq } from 'drizzle-orm'
import { getRouterParam, readBody, type H3Event } from 'h3'
import { events } from '../db/schema'
import { eventAccessRejection } from '../domain/access'
import type { AuthUser } from '../../shared/auth'
import { apiError, eventDeleted, eventNotFound } from './errors'
import { isMember } from './invite'
import { useDb, type Db } from './db'
import { requireUser } from './user'

export type EventRow = typeof events.$inferSelect

/**
 * A message for the Members who have the Event open (spec #153). A change queues them with `publish` while it runs;
 * the wrapper hands them to `afterCommit` once the transaction has committed. #156 gives this its real shape.
 */
export interface RoomMessage {
  type: string
}

declare module 'h3' {
  interface H3EventContext {
    /** Tests: called by `afterCommit` with the Event and the messages of the change that just committed (#183). */
    onAfterCommit?: (committed: { eventId: string, messages: RoomMessage[] }) => void
  }
}

export interface ChangeEventOptions extends LoadEventOptions {
  /** Runs once the User is known and before the body is read, e.g. a rate limit. It throws to refuse. */
  beforeBody?: (user: AuthUser) => void
}

/** What a change of an Event gets. `body` is `unknown` until the handler's parser has checked it. */
export interface EventChange {
  tx: Db
  eventRow: EventRow
  user: AuthUser
  body: unknown
  /** Queues messages for after the commit. A change that throws drops them with its transaction. */
  publish: (...messages: RoomMessage[]) => void
}

/**
 * The one way to change an Event (#183). Order matters and the tests pin it: 401 first, then the body is read (before
 * the lock), then one transaction in which `loadEvent` answers 404, 410 or 403 before the change runs any rule.
 * After the transaction commits, `afterCommit` runs with the messages the change queued; a change that throws never
 * reaches it. Joining through the Invite link loads the Event by its token instead and calls `afterCommit` itself.
 */
export async function changeEvent<T>(
  event: H3Event,
  { beforeBody, ...load }: ChangeEventOptions,
  change: (ctx: EventChange) => Promise<T>,
): Promise<T> {
  const user = await requireUser(event)
  beforeBody?.(user)
  const body: unknown = await readBody(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const messages: RoomMessage[] = []
  const { result, eventRow } = await useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, load)
    const publish = (...queued: RoomMessage[]) => void messages.push(...queued)
    const result = await change({ tx, eventRow, user, body, publish })
    return { result, eventRow }
  })
  await afterCommit(event, eventRow, messages)
  return result
}

/**
 * The single step that runs after a change to an Event has committed (#183). It does nothing yet: #156 publishes the
 * messages to the Event's room here, so no endpoint can forget to.
 */
export async function afterCommit(event: H3Event, eventRow: EventRow, messages: RoomMessage[]): Promise<void> {
  event.context.onAfterCommit?.({ eventId: eventRow.id, messages })
}

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
