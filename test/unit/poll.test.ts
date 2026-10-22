import { describe, expect, it } from 'vitest'
import { bestSlotId, hasVoted, parseVoteValue, voteRejection } from '../../server/domain/poll'

// Thursday 22 Oct 2026, 12:00 in Berlin (CEST). Slots before this instant are past.
const now = new Date('2026-10-22T10:00:00Z')
const slot = (id: string, startsAt: string) => ({ id, startsAt: new Date(startsAt) })
const vote = (slotId: string, userId: string, value: 'yes' | 'maybe' | 'no') => ({ slotId, userId, value })
const ME = 'me'

const FRI = slot('fri', '2026-10-23T18:00:00Z')
const SAT_EARLY = slot('sat-early', '2026-10-24T18:00:00Z')
const SAT_LATE = slot('sat-late', '2026-10-24T19:30:00Z')
const PAST = slot('past', '2026-10-20T18:00:00Z')

describe('bestSlotId', () => {
  it('picks the future Slot with the most yes Votes', () => {
    const votes = [vote('sat-late', 'a', 'yes'), vote('sat-late', 'b', 'yes'), vote('fri', 'a', 'yes'), vote('fri', 'c', 'maybe'), vote('fri', 'd', 'maybe')]

    expect(bestSlotId([FRI, SAT_LATE], votes, now)).toBe('sat-late')
  })

  it('breaks a tie on yes by the most maybe Votes', () => {
    const votes = [vote('fri', 'a', 'yes'), vote('fri', 'b', 'maybe'), vote('sat-late', 'a', 'yes'), vote('sat-late', 'b', 'maybe'), vote('sat-late', 'c', 'maybe')]

    expect(bestSlotId([FRI, SAT_LATE], votes, now)).toBe('sat-late')
  })

  it('breaks a tie on yes and maybe by the earliest Slot', () => {
    const votes = [vote('sat-late', 'a', 'yes'), vote('sat-early', 'b', 'yes')]

    expect(bestSlotId([SAT_LATE, SAT_EARLY], votes, now)).toBe('sat-early')
  })

  it('ignores past Slots, even when they have the most Votes', () => {
    const votes = [vote('past', 'a', 'yes'), vote('past', 'b', 'yes'), vote('past', 'c', 'yes'), vote('fri', 'a', 'maybe')]

    expect(bestSlotId([PAST, FRI], votes, now)).toBe('fri')
  })

  it('returns null when no future Slot has a yes or maybe Vote', () => {
    expect(bestSlotId([FRI, SAT_LATE], [], now)).toBeNull()
    expect(bestSlotId([FRI], [vote('fri', 'a', 'no')], now)).toBeNull()
    expect(bestSlotId([PAST], [vote('past', 'a', 'yes')], now)).toBeNull()
  })

  it('returns null when there are no Slots', () => {
    expect(bestSlotId([], [], now)).toBeNull()
  })
})

describe('hasVoted', () => {
  it('is true when the User has a Vote on every votable Slot', () => {
    const votes = [vote('fri', ME, 'no'), vote('sat-late', ME, 'maybe')]

    expect(hasVoted(['fri', 'sat-late'], votes, ME)).toBe(true)
  })

  it('is false when a votable Slot has no Vote from the User', () => {
    expect(hasVoted(['fri', 'sat-late'], [vote('fri', ME, 'yes')], ME)).toBe(false)
  })

  it('ignores Votes of other Users', () => {
    expect(hasVoted(['fri'], [vote('fri', 'someone-else', 'yes')], ME)).toBe(false)
  })

  it('is false when there is nothing to vote on', () => {
    expect(hasVoted([], [], ME)).toBe(false)
  })
})

describe('voteRejection', () => {
  it('accepts a Vote on a future Slot in the poll phase', () => {
    expect(voteRejection({ phase: 'poll', startsAt: FRI.startsAt, now })).toBeNull()
  })

  it('rejects a Vote outside the poll phase, so the Date cannot shift under the Host', () => {
    expect(voteRejection({ phase: 'date_set', startsAt: FRI.startsAt, now })).toBe('wrong_phase')
  })

  it('rejects a Vote on a past Slot', () => {
    expect(voteRejection({ phase: 'poll', startsAt: PAST.startsAt, now })).toBe('slot_past')
  })
})

describe('parseVoteValue', () => {
  it('accepts the three vote values', () => {
    expect(parseVoteValue('yes')).toBe('yes')
    expect(parseVoteValue('maybe')).toBe('maybe')
    expect(parseVoteValue('no')).toBe('no')
  })

  it('returns null for anything else', () => {
    expect(parseVoteValue('Ja')).toBeNull()
    expect(parseVoteValue('')).toBeNull()
    expect(parseVoteValue(undefined)).toBeNull()
  })
})
