import { hasVoted, type PollVote } from './poll'

// Home rules (#1 user stories 15–24, #12). Pure functions: the list handler loads the rows and
// passes them in; `now` is injected so the rules can be tested at a fixed moment.

export const HOME_DATE_GRACE_MS = 24 * 60 * 60 * 1000

export type HomeAction = 'open' | 'vote' | 'view'

/** A Session with a Date leaves Home once the Date is more than 24 h past. Polls have no Date and stay. */
export function isPastHomeGrace(startsAt: Date | null, now: Date): boolean {
  return startsAt !== null && startsAt.getTime() < now.getTime() - HOME_DATE_GRACE_MS
}

/** The User still has to vote: an open poll with Slots left to vote on and no full set of Votes. */
export function needsVote(phase: string, votableSlotIds: string[], votes: PollVote[], userId: string): boolean {
  return phase === 'poll' && votableSlotIds.length > 0 && !hasVoted(votableSlotIds, votes, userId)
}

/** The card's call to action: the Host opens the Session, a User who still has to vote is asked to vote, the rest view it. */
export function homeAction(input: { isHost: boolean, needsVote: boolean }): HomeAction {
  if (input.isHost) return 'open'
  return input.needsVote ? 'vote' : 'view'
}

export interface HomeOrderable {
  phase: string
  needsVote: boolean
  startsAt: Date | null
  createdAt: Date
}

/** Group order: open polls to vote on, other open polls, then Sessions with a Date. */
function group(item: HomeOrderable): number {
  if (item.needsVote) return 0
  return item.phase === 'poll' ? 1 : 2
}

/**
 * The order and the set of Sessions on Home (#12): drops Dates more than 24 h past, then sorts by
 * group. Open polls go newest first; Dates go upcoming first.
 */
export function arrangeHome<T extends HomeOrderable>(items: T[], now: Date): T[] {
  return items
    .filter(item => !isPastHomeGrace(item.startsAt, now))
    .sort((a, b) => {
      const byGroup = group(a) - group(b)
      if (byGroup !== 0) return byGroup
      if (group(a) === 2) return (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
}
