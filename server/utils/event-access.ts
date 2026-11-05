import { eq } from 'drizzle-orm'
import { getRouterParam, readBody, type H3Event } from 'h3'
import { events } from '../db/schema'
import { eventAccessRejection } from '../domain/access'
import type { AuthUser } from '../../shared/auth'
import { beforeFinish } from '../../shared/event'
import { envelope, type RoomMessage } from '../../shared/realtime'
import { useClock } from './clock'
import { apiError, eventDeleted, eventNotFound } from './errors'
import { isMember } from './invite'
import { useDb, type Db } from './db'
import { publishAfterResponse } from './room-notifier'
import { settleDue } from './settle'
import { requireUser } from './user'

export type EventRow = typeof events.$inferSelect

export interface ChangeEventOptions extends LoadEventOptions {
  /** Runs once the User is known and before the body is read, e.g. a rate limit. It throws to refuse. */
  beforeBody?: (user: AuthUser) => void
  /**
   * Whether the change may run in a finished Event (default false: a finished Event is read-only for good, #277). Only the Host rotating
   * the Invite link does; every other change answers `wrong_phase` there, so no write route can forget the rule.
   */
  allowFinished?: boolean
  /**
   * Whether the commit broadcasts `event.changed` to the whole room (default true). A change that must not tell every Party
   * that it happened sets `false` (a sealed Veto, #231): then only the messages the change queued itself go out, the named
   * sends included.
   */
  broadcast?: boolean
}

/** What a change of an Event gets. `body` is `unknown` until the handler's parser has checked it. */
export interface EventChange {
  tx: Db
  eventRow: EventRow
  user: AuthUser
  body: unknown
  /** The request's clock, read once (ADR 0013). Every instant a change stamps or compares comes from here, never from `useClock` in a handler. */
  now: Date
  /** Queues messages for after the commit. A change that throws drops them with its transaction. */
  publish: (...messages: RoomMessage[]) => void
  /** Queues messages for after the commit that only these Users' sockets get (#227, the sealed Vetoes of 0.7). A change that throws drops them too. */
  publishTo: (userIds: readonly string[], ...messages: RoomMessage[]) => void
}

/** What a rule function of a change reads: the transaction, the locked Event, the User, the queue and the request's clock (#288). */
export type ChangeCore = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish' | 'now'>

/** Messages of a change that go to the sockets of named Users only (#227). */
interface NamedMessages {
  to: readonly string[]
  messages: RoomMessage[]
}

/**
 * The one way to change an Event (#183). Order matters and the tests pin it: 401 first, then the body is read (before
 * the lock), then one transaction in which `loadEvent` answers 404, 410 or 403 before the change runs any rule, the request's
 * clock is read once (`EventChange.now`) and, for a `lock: 'update'` change, due draws are settled (#259).
 * After the transaction commits, `afterCommit` runs with the messages the change queued; a change that throws never
 * reaches it. Joining through the Invite link loads the Event by its token instead and calls `afterCommit` itself.
 * The publish runs after the response (#202), so the change answers without waiting for the Worker.
 */
export async function changeEvent<T>(
  event: H3Event,
  { allowFinished, beforeBody, broadcast, ...load }: ChangeEventOptions,
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
    // The one rule of a finished Event (#277): after the 404, 410 and 403 of loadEvent and before any rule of the change, every write refuses.
    if (!allowFinished && !beforeFinish(eventRow.phase)) throw apiError('wrong_phase')
    // Read after the row lock is taken, so the instants of writes queued on one Event follow the lock order.
    const now = useClock(event).now()
    // A draw whose last instant has passed is settled first, whatever the change reads (#229, #259): a writer cannot forget it, and the
    // lock on „Rad verdecken“ is free again at the end of a draw (#231). A `share` lock (Votes) never settles: the settle writes.
    if (load.lock === 'update') await settleDue(tx, eventRow, now)
    const publish = (...queued: RoomMessage[]) => void messages.push(...queued)
    const publishTo = (to: readonly string[], ...queued: RoomMessage[]) => void named.push({ to, messages: queued })
    const result = await change({ tx, eventRow, user, body, now, publish, publishTo })
    return { result, eventRow }
  })
  afterCommit(event, eventRow, messages, named, broadcast)
  return result
}

/**
 * The single step that runs after a change to an Event has committed (#183): it tells the Event's room (#156). Every
 * committed change publishes `event.changed` (the client refetches the Event read) plus the messages the change
 * queued, so no endpoint can forget to (unless it opts out with `broadcast: false`, #231). The publish runs after the response (#202): the notifier never throws and a
 * missed message is made up by the client's refetch, so this never fails the request.
 */
export function afterCommit(event: H3Event, eventRow: EventRow, messages: RoomMessage[], named: NamedMessages[] = [], broadcast = true): void {
  const now = useClock(event).now().getTime()
  const all: RoomMessage[] = !broadcast || messages.some(message => message.type === 'event.changed') ? messages : [{ type: 'event.changed' }, ...messages]
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
