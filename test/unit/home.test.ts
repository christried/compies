import { describe, expect, it } from 'vitest'
import { arrangeHome, homeAction, homeSessionIndex, needsVote, staysOnHome } from '../../server/domain/home'
import type { Phase } from '../../shared/event'

// Thursday 22 Oct 2026, 12:00 in Berlin (CEST). Dates older than 24 h before this instant drop off Home.
const now = new Date('2026-10-22T10:00:00Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000)
const hoursAhead = (hours: number) => new Date(now.getTime() + hours * 3_600_000)

describe('staysOnHome', () => {
  it('leaves an Event once all its Dates are more than 24 h past', () => {
    expect(staysOnHome([hoursAgo(25)], now)).toBe(false)
    expect(staysOnHome([hoursAgo(25), hoursAgo(30)], now)).toBe(false)
  })

  it('keeps an Event whose Date is less than 24 h past, or upcoming', () => {
    expect(staysOnHome([hoursAgo(23)], now)).toBe(true)
    expect(staysOnHome([hoursAhead(3)], now)).toBe(true)
  })

  it('keeps a poll, which has no Date yet', () => {
    expect(staysOnHome([null], now)).toBe(true)
  })

  it('keeps an Event while a Session has no Date, even if the others have passed', () => {
    expect(staysOnHome([hoursAgo(30), null], now)).toBe(true)
  })

  it('keeps an Event while any Session is upcoming or less than 24 h past', () => {
    expect(staysOnHome([hoursAgo(30), hoursAhead(48)], now)).toBe(true)
    expect(staysOnHome([hoursAgo(30), hoursAgo(2)], now)).toBe(true)
  })
})

describe('homeSessionIndex', () => {
  it('picks the next upcoming Session, whatever its position', () => {
    expect(homeSessionIndex([hoursAhead(72), hoursAhead(24), hoursAhead(120)], now)).toBe(1)
  })

  it('skips Sessions without a Date and passed Sessions', () => {
    expect(homeSessionIndex([hoursAgo(30), null, hoursAhead(48)], now)).toBe(2)
  })

  it('falls back to the latest passed Session when none is upcoming', () => {
    expect(homeSessionIndex([hoursAgo(30), hoursAgo(2), hoursAgo(50), null], now)).toBe(1)
  })

  it('returns null while no Session has a Date', () => {
    expect(homeSessionIndex([null, null], now)).toBeNull()
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

  it('is false when no Slot is left to vote on, and for Events with a Date', () => {
    expect(needsVote('poll', [], [], 'me')).toBe(false)
    expect(needsVote('date_set', slots, [], 'me')).toBe(false)
  })
})

describe('homeAction', () => {
  it('opens the Event for its Host', () => {
    expect(homeAction({ isHost: true, needsVote: true })).toBe('open')
  })

  it('asks for a vote when the User still has to vote, and shows the rest', () => {
    expect(homeAction({ isHost: false, needsVote: true })).toBe('vote')
    expect(homeAction({ isHost: false, needsVote: false })).toBe('view')
  })
})

describe('arrangeHome', () => {
  const item = (name: string, fields: { phase?: Phase, needsVote?: boolean, startsAt?: Date | null, sessionStarts?: (Date | null)[], createdAt?: Date } = {}) => ({
    name,
    phase: fields.phase ?? 'poll',
    needsVote: fields.needsVote ?? false,
    sessionStarts: fields.sessionStarts ?? [fields.startsAt ?? null],
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

  it('lists upcoming Dates before Dates that passed within the last 24 h, the most recent of those first', () => {
    const arranged = arrangeHome([
      item('passed-earlier', { phase: 'date_set', startsAt: hoursAgo(20) }),
      item('passed-just-now', { phase: 'date_set', startsAt: hoursAgo(1) }),
      item('upcoming-later', { phase: 'date_set', startsAt: hoursAhead(48) }),
      item('upcoming-sooner', { phase: 'date_set', startsAt: hoursAhead(2) }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['upcoming-sooner', 'upcoming-later', 'passed-just-now', 'passed-earlier'])
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

  it('orders an Event with several Sessions by its next upcoming Session', () => {
    const arranged = arrangeHome([
      item('two-sessions-later', { phase: 'date_set', sessionStarts: [hoursAgo(30), hoursAhead(72)] }),
      item('one-session-sooner', { phase: 'date_set', startsAt: hoursAhead(24) }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['one-session-sooner', 'two-sessions-later'])
  })

  it('keeps an Event between its Sessions, while a Session still waits for a Date', () => {
    const arranged = arrangeHome([
      item('waiting', { sessionStarts: [hoursAgo(30), null] }),
      item('gone', { phase: 'date_set', sessionStarts: [hoursAgo(30), hoursAgo(26)] }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['waiting'])
  })
})
