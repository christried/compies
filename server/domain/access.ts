// Who may open an Event (ADR 0006, #1 § Auth and permissions). Pure: the loader in
// server/utils/event-access.ts reads the rows and asks this rule.

export type EventAccessRejection = 'not_found' | 'deleted' | 'not_host'

export interface EventAccessInput {
  /** The Event the slug names, deleted ones included; null when there is none. */
  event: { hostId: string, deletedAt: Date | null } | null
  isMember: boolean
  userId: string
  /** The request is one only the Host of this Event may make. */
  hostOnly: boolean
}

/**
 * Why the User may not go on, or null. A non-Member and an unknown slug get the same answer, so
 * nobody can probe which Events exist; only a former Member learns that an Event was deleted.
 * Host-only requests need the Host of this Event, whatever the User's Host permission (ADR 0002).
 */
export function eventAccessRejection(input: EventAccessInput): EventAccessRejection | null {
  if (!input.event || !input.isMember) return 'not_found'
  if (input.event.deletedAt) return 'deleted'
  if (input.hostOnly && input.event.hostId !== input.userId) return 'not_host'
  return null
}
