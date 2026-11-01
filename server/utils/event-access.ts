import { eq } from 'drizzle-orm'
import { getRouterParam, readBody, type H3Event } from 'h3'
import { events } from '../db/schema'
import { eventAccessRejection } from '../domain/access'
import type { AuthUser } from '../../shared/auth'
import { envelope, type RoomMessage } from '../../shared/realtime'
import { apiError, eventDeleted, eventNotFound } from './errors'
import { isMember } from './invite'
import { useDb, type Db } from './db'
import { publishAfterResponse } from './room-notifier'
import { requireUser } from './user'

export type EventRow = typeof events.$inferSelect

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
  /** Queues messages for after the commit that only these Users' sockets get (#227, the sealed Vetoes of 0.7). A change that throws drops them too. */
  publishTo: (userIds: readonly string[], ...messages: RoomMessage[]) => void
}

/** Messages of a change that go to the sockets of named Users only (#227). */
interface NamedMessages {
  to: readonly string[]
  messages: RoomMessage[]
}

/**
 * The one way to change an Event (#183). Order matters and the tests pin it: 401 first, then the body is read (before
 * the lock), then one transaction in which `loadEvent` answers 404, 410 or 403 before the change runs any rule.
 * After the transaction commits, `afterCommit` runs with the messages the change queued; a change that throws never
 * reaches it. Joining through the Invite link loads the Event by its token instead and calls `afterCommit` itself.
 * The publish runs after the response (#202), so the change answers without waiting for the Worker.
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
  const named: NamedMessages[] = []
  const { result, eventRow } = await useDb(event).transaction(async (tx) => {
    const eventRow = await loadEvent(tx, slug, user.id, load)
    const publish = (...queued: RoomMessage[]) => void messages.push(...queued)
    const publishTo = (to: readonly string[], ...queued: RoomMessage[]) => void named.push({ to, messages: queued })
    const result = await change({ tx, eventRow, user, body, publish, publishTo })
    return { result, eventRow }
  })
  afterCommit(event, eventRow, messages, named)
  return result
}

/**
 * The single step that runs after a change to an Event has committed (#183): it tells the Event's room (#156). Every
 * committed change publishes `event.changed` (the client refetches the Event read) plus the messages the change
 * queued, so no endpoint can forget to. The publish runs after the response (#202): the notifier never throws and a
 * missed message is made up by the client's refetch, so this never fails the request.
 */
export function afterCommit(event: H3Event, eventRow: EventRow, messages: RoomMessage[], named: NamedMessages[] = []): void {
  const now = Date.now()
  const all: RoomMessage[] = messages.some(message => message.type === 'event.changed') ? messages : [{ type: 'event.changed' }, ...messages]
  publishAfterResponse(event, eventRow.id, all.map(message => envelope(message, now)))
  // A named send never adds `event.changed`: it reaches some Users only, and the broadcast above already says the Event changed (#227).
  for (const group of named) publishAfterResponse(event, eventRow.id, group.messages.map(message => envelope(message, now)), group.to)
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
