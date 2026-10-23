import type { HomeAction, Phase } from '../../shared/event'
import { hasVoted, isPast, type PollVote } from './poll'

// Home rules (#1 user stories 15–24, #12). Pure functions: the list handler loads the rows and
// passes them in; `now` is injected so the rules can be tested at a fixed moment.

export const HOME_DATE_GRACE_MS = 24 * 60 * 60 * 1000

/** An Event with a Date leaves Home once the Date is more than 24 h past. Polls have no Date and stay. */
export function isPastHomeGrace(startsAt: Date | null, now: Date): boolean {
  return startsAt !== null && startsAt.getTime() < now.getTime() - HOME_DATE_GRACE_MS
}

/** The User still has to vote: an open poll with Slots left to vote on and no full set of Votes. */
export function needsVote(phase: Phase, votableSlotIds: string[], votes: PollVote[], userId: string): boolean {
  return phase === 'poll' && votableSlotIds.length > 0 && !hasVoted(votableSlotIds, votes, userId)
}

/** The card's call to action: the Host opens the Event, a User who still has to vote is asked to vote, the rest view it. */
export function homeAction(input: { isHost: boolean, needsVote: boolean }): HomeAction {
  if (input.isHost) return 'open'
  return input.needsVote ? 'vote' : 'view'
}

export interface HomeOrderable {
  phase: Phase
  needsVote: boolean
  startsAt: Date | null
  createdAt: Date
}

/** Group order: open polls to vote on, other open polls, upcoming Dates, then Dates that just passed. */
const GROUP = { toVote: 0, otherPoll: 1, upcomingDate: 2, passedDate: 3 } as const

function group(item: HomeOrderable, now: Date): number {
  if (item.needsVote) return GROUP.toVote
  if (item.phase === 'poll') return GROUP.otherPoll
  return item.startsAt && isPast(item.startsAt, now) ? GROUP.passedDate : GROUP.upcomingDate
}

/**
 * The order and the set of Events on Home (#12): drops Dates more than 24 h past, then sorts by
 * group. Open polls go newest first. Upcoming Dates go soonest first; a Date that passed within the
 * last 24 h comes after them, the most recent one first.
 */
export function arrangeHome<T extends HomeOrderable>(items: T[], now: Date): T[] {
  const time = (item: T) => item.startsAt?.getTime() ?? 0
  return items
    .filter(item => !isPastHomeGrace(item.startsAt, now))
    .sort((a, b) => {
      const groupA = group(a, now)
      const byGroup = groupA - group(b, now)
      if (byGroup !== 0) return byGroup
      if (groupA === GROUP.upcomingDate) return time(a) - time(b)
      if (groupA === GROUP.passedDate) return time(b) - time(a)
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
}
