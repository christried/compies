import { describe, expect, it } from 'vitest'
import { arrangeHome, homeAction, isPastHomeGrace, needsVote } from '../../server/domain/home'

// Thursday 22 Oct 2026, 12:00 in Berlin (CEST). Dates older than 24 h before this instant drop off Home.
const now = new Date('2026-10-22T10:00:00Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000)
const hoursAhead = (hours: number) => new Date(now.getTime() + hours * 3_600_000)

describe('isPastHomeGrace', () => {
  it('hides a Date that is more than 24 h past', () => {
    expect(isPastHomeGrace(hoursAgo(25), now)).toBe(true)
  })

  it('keeps a Date that is less than 24 h past, and upcoming Dates', () => {
    expect(isPastHomeGrace(hoursAgo(23), now)).toBe(false)
    expect(isPastHomeGrace(hoursAhead(3), now)).toBe(false)
  })

  it('keeps a poll, which has no Date yet', () => {
    expect(isPastHomeGrace(null, now)).toBe(false)
  })
})

describe('needsVote', () => {
  const slots = ['fri', 'sat']

  it('is true for an open poll with a votable Slot the User has not voted on', () => {
    expect(needsVote('poll', slots, [{ slotId: 'fri', userId: 'me', value: 'yes' }], 'me')).toBe(true)
  })

  it('is false once the User has a Vote on every votable Slot', () => {
    const votes = [{ slotId: 'fri', userId: 'me', value: 'yes' as const }, { slotId: 'sat', userId: 'me', value: 'no' as const }]

    expect(needsVote('poll', slots, votes, 'me')).toBe(false)
  })

  it('is false when no Slot is left to vote on, and for Sessions with a Date', () => {
    expect(needsVote('poll', [], [], 'me')).toBe(false)
    expect(needsVote('date_set', slots, [], 'me')).toBe(false)
  })
})

describe('homeAction', () => {
  it('opens the Session for its Host', () => {
    expect(homeAction({ isHost: true, needsVote: true })).toBe('open')
  })

  it('asks for a vote when the User still has to vote, and shows the rest', () => {
    expect(homeAction({ isHost: false, needsVote: true })).toBe('vote')
    expect(homeAction({ isHost: false, needsVote: false })).toBe('view')
  })
})

describe('arrangeHome', () => {
  const item = (name: string, fields: { phase?: string, needsVote?: boolean, startsAt?: Date | null, createdAt?: Date } = {}) => ({
    name,
    phase: fields.phase ?? 'poll',
    needsVote: fields.needsVote ?? false,
    startsAt: fields.startsAt ?? null,
    createdAt: fields.createdAt ?? hoursAgo(48),
  })

  it('lists open polls the User has not voted on first, then other open polls, then Dates upcoming first', () => {
    const arranged = arrangeHome([
      item('date-later', { phase: 'date_set', startsAt: hoursAhead(72) }),
      item('voted-poll'),
      item('date-sooner', { phase: 'date_set', startsAt: hoursAhead(24) }),
      item('todo-poll', { needsVote: true }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['todo-poll', 'voted-poll', 'date-sooner', 'date-later'])
  })

  it('lists the newest open polls first within a group', () => {
    const arranged = arrangeHome([
      item('older', { needsVote: true, createdAt: hoursAgo(72) }),
      item('newer', { needsVote: true, createdAt: hoursAgo(1) }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['newer', 'older'])
  })

  it('drops Dates that are more than 24 h past and keeps the ones within the grace period', () => {
    const arranged = arrangeHome([
      item('gone', { phase: 'date_set', startsAt: hoursAgo(30) }),
      item('just-passed', { phase: 'date_set', startsAt: hoursAgo(2) }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['just-passed'])
  })
})
