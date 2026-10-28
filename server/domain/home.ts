import type { HomeAction, Phase } from '../../shared/event'
import { hasVoted, isPast, type PollVote } from './poll'
import { isDated } from './session'

// Home rules (#1 user stories 15–24, #12). Pure functions: the list handler loads the rows and
// passes them in; `now` is injected so the rules can be tested at a fixed moment.

export const HOME_DATE_GRACE_MS = 24 * 60 * 60 * 1000

/**
 * An Event stays on Home while a Session has no Date, or any Session's Date is upcoming or less than
 * 24 h past (#54). It leaves once every Session has a Date and all of them are more than 24 h past.
 */
export function staysOnHome(sessionStarts: (Date | null)[], now: Date): boolean {
  return sessionStarts.some(startsAt => startsAt === null || startsAt.getTime() >= now.getTime() - HOME_DATE_GRACE_MS)
}

/**
 * The Session Home shows (#54): the next upcoming one by Date, else the latest passed one. Null while no
 * Session has a Date.
 */
export function homeSession<S extends { startsAt: Date | null }>(sessions: S[], now: Date): (S & { startsAt: Date }) | null {
  let upcoming: (S & { startsAt: Date }) | null = null
  let latestPassed: (S & { startsAt: Date }) | null = null
  for (const session of sessions.filter(isDated)) {
    const time = session.startsAt.getTime()
    if (isPast(session.startsAt, now)) {
      if (!latestPassed || time > latestPassed.startsAt.getTime()) latestPassed = session
      continue
    }
    if (!upcoming || time < upcoming.startsAt.getTime()) upcoming = session
  }
  return upcoming ?? latestPassed
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
  /** Each Session's Date, null while it waits for one. */
  sessionStarts: (Date | null)[]
  /** The Date of the Session Home shows (homeSession), null while no Session has a Date. */
  homeDate: Date | null
  createdAt: Date
}

/** Group order: open polls to vote on, other open polls, upcoming Dates, then Dates that just passed. */
const GROUP = { toVote: 0, otherPoll: 1, upcomingDate: 2, passedDate: 3 } as const

/** The sort bucket of an item: one of GROUP. */
function orderGroup(item: HomeOrderable, now: Date): number {
  if (item.needsVote) return GROUP.toVote
  if (item.phase === 'poll') return GROUP.otherPoll
  return item.homeDate && isPast(item.homeDate, now) ? GROUP.passedDate : GROUP.upcomingDate
}

/**
 * The order and the set of Events on Home (#12, #54): drops Events that `staysOnHome` rejects, then
 * sorts by group. Open polls go newest first. Upcoming Dates go soonest first, by the next upcoming
 * Session; a Date that passed within the last 24 h comes after them, the most recent one first.
 */
export function arrangeHome<T extends HomeOrderable>(items: T[], now: Date): T[] {
  const time = (item: T) => item.homeDate?.getTime() ?? 0
  return items
    .filter(item => staysOnHome(item.sessionStarts, now))
    .sort((a, b) => {
      const groupA = orderGroup(a, now)
      const byGroup = groupA - orderGroup(b, now)
      if (byGroup !== 0) return byGroup
      if (groupA === GROUP.upcomingDate) return time(a) - time(b)
      if (groupA === GROUP.passedDate) return time(b) - time(a)
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
}
