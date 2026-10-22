import { VOTE_VALUES, type VoteValue } from '../../shared/poll'
import type { Phase } from '../../shared/session'

// Date poll rules (#1 § Domain rules, ADR 0001). Pure functions: the handlers load the rows and
// pass them in; `now` is injected so the rules can be tested at a fixed moment.

export interface PollSlot {
  id: string
  startsAt: Date
}

export interface PollVote {
  slotId: string
  userId?: string
  value: VoteValue
}

/** A Slot is past once its start is at or before `now`. Past Slots cannot be voted on. */
export function isPast(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() <= now.getTime()
}

/**
 * The Best slot: among future Slots, the most yes Votes, then the most maybe Votes, then the earliest.
 * Null when no future Slot has a yes or maybe Vote.
 */
export function bestSlotId(slots: PollSlot[], votes: PollVote[], now: Date): string | null {
  const candidates = slots
    .filter(slot => !isPast(slot.startsAt, now))
    .map(slot => ({
      slot,
      yes: votes.filter(vote => vote.slotId === slot.id && vote.value === 'yes').length,
      maybe: votes.filter(vote => vote.slotId === slot.id && vote.value === 'maybe').length,
    }))
    .filter(candidate => candidate.yes + candidate.maybe > 0)

  candidates.sort((a, b) =>
    b.yes - a.yes
    || b.maybe - a.maybe
    || a.slot.startsAt.getTime() - b.slot.startsAt.getTime())

  return candidates[0]?.slot.id ?? null
}

/**
 * "Has voted" (GLOSSARY): a Vote on every votable Slot (the Slots that are not past). The spec says
 * "every Slot"; past Slots are left out on purpose, because nobody can vote on them any more, so a
 * Member who joins late could otherwise never count as voted. With nothing left to vote on, nobody
 * has voted, so an empty list is false rather than vacuously true.
 */
export function hasVoted(votableSlotIds: string[], votes: PollVote[], userId: string): boolean {
  if (votableSlotIds.length === 0) return false
  const voted = new Set(votes.filter(vote => vote.userId === userId).map(vote => vote.slotId))
  return votableSlotIds.every(id => voted.has(id))
}

export interface PollStanding<S extends PollSlot> {
  /** The Slots that can still be voted on (not past), in the given order. */
  votableSlotIds: string[]
  bestSlot: S | null
  /** Members who have voted (see hasVoted), out of all Members. */
  progress: { voted: number, total: number }
  viewerVoted: boolean
}

/** Where a Session's poll stands for one viewer: the Best slot and who has voted. Used by the Session read and Home. */
export function pollStanding<S extends PollSlot>(input: { slots: S[], votes: PollVote[], memberIds: string[], viewerId: string, now: Date }): PollStanding<S> {
  const votableSlotIds = input.slots.filter(slot => !isPast(slot.startsAt, input.now)).map(slot => slot.id)
  const bestId = bestSlotId(input.slots, input.votes, input.now)
  return {
    votableSlotIds,
    bestSlot: input.slots.find(slot => slot.id === bestId) ?? null,
    progress: {
      voted: input.memberIds.filter(id => hasVoted(votableSlotIds, input.votes, id)).length,
      total: input.memberIds.length,
    },
    viewerVoted: hasVoted(votableSlotIds, input.votes, input.viewerId),
  }
}

export type VoteRejection = 'wrong_phase' | 'slot_past'

/** Why a Vote on this Slot is refused, or null. Votes need the poll phase and a Slot that is not past (#1). */
export function voteRejection(input: { phase: Phase, startsAt: Date, now: Date }): VoteRejection | null {
  if (input.phase !== 'poll') return 'wrong_phase'
  if (isPast(input.startsAt, input.now)) return 'slot_past'
  return null
}

/** The vote value from a request body, or null when it is not one of the three. */
export function parseVoteValue(raw: unknown): VoteValue | null {
  return (VOTE_VALUES as readonly unknown[]).includes(raw) ? (raw as VoteValue) : null
}
