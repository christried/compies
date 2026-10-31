import { describe, expect, it } from 'vitest'
import { arrangeHome, homeAction, homeSession, needsVote, staysOnHome, type HomeSessionTimes } from '../../server/domain/home'
import type { Phase } from '../../shared/event'

// Thursday 22 Oct 2026, 12:00 in Berlin (CEST). An Event leaves Home a day after its last Session has ended.
const now = new Date('2026-10-22T10:00:00Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000)
const hoursAhead = (hours: number) => new Date(now.getTime() + hours * 3_600_000)

/** A Session with its Date, not started yet. */
const dated = (startsAt: Date): HomeSessionTimes => ({ startsAt, startedAt: null, endedAt: null })
/** A Session still waiting for its Date, not started. */
const undated = (): HomeSessionTimes => ({ startsAt: null, startedAt: null, endedAt: null })
/** A Session that has ended at `endedAt`, started an hour before it and dated on the same day. */
const ended = (endedAt: Date): HomeSessionTimes => ({ startsAt: endedAt, startedAt: new Date(endedAt.getTime() - 3_600_000), endedAt })

describe('staysOnHome', () => {
  it('keeps an Event while a Session runs, however old its Date', () => {
    const running = { startsAt: hoursAgo(72), startedAt: hoursAgo(72), endedAt: null }

    expect(staysOnHome([running], now)).toBe(true)
  })

  it('keeps an Event while a dated Session has not started, however old its Date', () => {
    expect(staysOnHome([dated(hoursAgo(30 * 24))], now)).toBe(true)
  })

  it('keeps an Event while a Session has no Date', () => {
    expect(staysOnHome([undated()], now)).toBe(true)
    expect(staysOnHome([ended(hoursAgo(30)), undated()], now)).toBe(true)
  })

  it('keeps an Event for 24 h after its last Session has ended, and leaves it after that', () => {
    expect(staysOnHome([ended(hoursAgo(23))], now)).toBe(true)
    expect(staysOnHome([ended(hoursAgo(25))], now)).toBe(false)
    expect(staysOnHome([ended(hoursAgo(30)), ended(hoursAgo(25))], now)).toBe(false)
  })

  it('keeps an Event while any Session has ended less than 24 h ago', () => {
    expect(staysOnHome([ended(hoursAgo(30)), ended(hoursAgo(23))], now)).toBe(true)
  })

  it('keeps an Event whose one Session ended 2 days ago while another is dated, not started and due yesterday', () => {
    expect(staysOnHome([ended(hoursAgo(48)), dated(hoursAgo(24))], now)).toBe(true)
  })

  it('leaves an Event without Sessions', () => {
    expect(staysOnHome([], now)).toBe(false)
  })
})

describe('homeSession', () => {
  /** Sessions named by their position, so a test can say which one Home picks. */
  const sessions = (...starts: (Date | null)[]) => starts.map((startsAt, index) => ({ id: String(index), startsAt }))

  it('picks the next upcoming Session, whatever its position', () => {
    expect(homeSession(sessions(hoursAhead(72), hoursAhead(24), hoursAhead(120)), now)).toEqual({ id: '1', startsAt: hoursAhead(24) })
  })

  it('skips Sessions without a Date and passed Sessions', () => {
    expect(homeSession(sessions(hoursAgo(30), null, hoursAhead(48)), now)?.id).toBe('2')
  })

  it('falls back to the latest passed Session when none is upcoming', () => {
    expect(homeSession(sessions(hoursAgo(30), hoursAgo(2), hoursAgo(50), null), now)?.id).toBe('1')
  })

  it('returns null while no Session has a Date', () => {
    expect(homeSession(sessions(null, null), now)).toBeNull()
  })
})

describe('needsVote', () => {
  const slots = ['fri', 'sat']

  it('is true for an open poll with a votable Slot the User has not voted on', () => {
    expect(needsVote('poll', 1, slots, [{ slotId: 'fri', userId: 'me', value: 'yes' }], 'me')).toBe(true)
  })

  it('is false once the User has a Vote on every votable Slot', () => {
    const votes = [{ slotId: 'fri', userId: 'me', value: 'yes' as const }, { slotId: 'sat', userId: 'me', value: 'no' as const }]

    expect(needsVote('poll', 1, slots, votes, 'me')).toBe(false)
  })

  it('is false when no Slot is left to vote on, and for Events with a Date', () => {
    expect(needsVote('poll', 1, [], [], 'me')).toBe(false)
    expect(needsVote('date_set', 0, slots, [], 'me')).toBe(false)
  })
})

describe('needsVote in a running Event (#164)', () => {
  it('is true while a Session still waits for a Date, false once every Session has one', () => {
    expect(needsVote('running', 1, ['fri'], [], 'me')).toBe(true)
    expect(needsVote('running', 0, ['fri'], [], 'me')).toBe(false)
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
  /** An Event card; `startsAt` stands for a single dated Session, `sessions` gives its Sessions, `homeDate` names the Session Home shows of several. */
  const item = (name: string, fields: { phase?: Phase, needsVote?: boolean, startsAt?: Date | null, sessions?: HomeSessionTimes[], homeDate?: Date, createdAt?: Date } = {}) => ({
    name,
    phase: fields.phase ?? 'poll',
    needsVote: fields.needsVote ?? false,
    sessions: fields.sessions ?? [fields.startsAt ? dated(fields.startsAt) : undated()],
    homeDate: fields.homeDate ?? fields.startsAt ?? null,
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

  it('lists a running Event with a Session in its poll among the open polls', () => {
    const arranged = arrangeHome([
      item('date', { phase: 'date_set', startsAt: hoursAhead(24) }),
      item('running-poll', { phase: 'running', sessions: [dated(hoursAhead(1)), undated()], homeDate: hoursAhead(1) }),
      item('running', { phase: 'running', startsAt: hoursAhead(2) }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['running-poll', 'running', 'date'])
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

  it('drops Events whose Sessions all ended more than 24 h ago, and keeps the ones that ended within the grace period', () => {
    const arranged = arrangeHome([
      item('gone', { phase: 'date_set', sessions: [ended(hoursAgo(30))] }),
      item('just-ended', { phase: 'date_set', sessions: [ended(hoursAgo(2))] }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['just-ended'])
  })

  it('keeps an Event whose dated Session is more than 24 h past but has not started', () => {
    const arranged = arrangeHome([
      item('overdue', { phase: 'date_set', startsAt: hoursAgo(30 * 24) }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['overdue'])
  })

  it('orders an Event with several Sessions by the Session Home shows', () => {
    const arranged = arrangeHome([
      item('two-sessions-later', { phase: 'date_set', sessions: [ended(hoursAgo(30)), dated(hoursAhead(72))], homeDate: hoursAhead(72) }),
      item('one-session-sooner', { phase: 'date_set', startsAt: hoursAhead(24) }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['one-session-sooner', 'two-sessions-later'])
  })

  it('keeps an Event between its Sessions, while a Session still waits for a Date', () => {
    const arranged = arrangeHome([
      item('waiting', { sessions: [ended(hoursAgo(30)), undated()] }),
      item('gone', { phase: 'date_set', sessions: [ended(hoursAgo(30)), ended(hoursAgo(26))] }),
    ], now)

    expect(arranged.map(row => row.name)).toEqual(['waiting'])
  })
})
