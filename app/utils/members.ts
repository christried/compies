import type { MemberView } from '~~/shared/event'

/**
 * The ids of the Members who still count as a person: not marked `deleted` (#915). The Chat and the Activity feed compare these ids between two reads of the Event, so one rule
 * covers an ended membership and, in a finished Event, a Deleted User who keeps their Seat (ADR 0013, amendment of 2026-11-20; #992).
 */
export function livingMemberIds(members: readonly Pick<MemberView, 'id' | 'deleted'>[]): string[] {
  return members.filter(member => member.deleted !== true).map(member => member.id)
}

/**
 * Whether a read of the Event no longer lists a Member that the read before listed as a person: a membership ended (a deleted account in 0.21, a removal by the Host from 0.22, #697),
 * or a Member turned deleted and kept their place in a finished Event (#992). The Chat and the Activity feed read again then, since what they hold names that person by what they were (#990).
 * A Member who joined, or a reorder, is no end.
 */
export function membershipEnded(before: readonly string[], after: readonly string[]): boolean {
  const still = new Set(after)
  return before.some(id => !still.has(id))
}
