import { describe, expect, it } from 'vitest'
import { type CheckedSession, deployCheck } from '../../server/domain/game-day'

// The game-day rule behind the Worker deploy guard (#157): a deploy drops every socket, so it must not happen on a day
// a Session is dated. "Today" is the Berlin calendar day (ADR 0003), whatever the server's clock zone. The reason names
// the blocking Sessions by Event id, Session id and number, never by a slug: the deploy log is public (retro 0.9, finding 1; #332).
const at = (iso: string) => new Date(iso)

/** How many of the Dates the check counts as today: 0 when it says ok, else the count its reason gives. */
function sessionsToday(startsAt: (Date | null)[], now: Date): number {
  const { ok, reason } = deployCheck({ sessions: startsAt.map(date => ({ eventId: 'event-freitag', sessionId: 'session-freitag', number: null, startsAt: date, runningSince: null })), now })
  return ok ? 0 : Number(/(\d+) Sessions? (?:is|are) dated today/.exec(reason!)![1])
}

describe('the Berlin day of a dated Session', () => {
  it('counts the Sessions dated on the Berlin day of now', () => {
    const now = at('2024-01-15T10:00:00Z')

    expect(sessionsToday([at('2024-01-15T19:00:00Z'), at('2024-01-15T08:00:00Z'), at('2024-01-16T19:00:00Z')], now)).toBe(2)
  })

  it('ignores a Session without a Date', () => {
    expect(sessionsToday([null, at('2024-01-15T19:00:00Z')], at('2024-01-15T10:00:00Z'))).toBe(1)
  })

  it('takes the Berlin day, not the UTC day, at midnight in winter', () => {
    const now = at('2024-01-14T23:30:00Z') // 00:30 on 15 January in Berlin, still the 14th in UTC

    expect(sessionsToday([at('2024-01-14T23:00:00Z')], now)).toBe(1) // 00:00 Berlin: first minute of today
    expect(sessionsToday([at('2024-01-14T22:59:00Z')], now)).toBe(0) // 23:59 Berlin yesterday
    expect(sessionsToday([at('2024-01-15T22:59:00Z')], now)).toBe(1) // 23:59 Berlin: last minute of today
    expect(sessionsToday([at('2024-01-15T23:00:00Z')], now)).toBe(0) // 00:00 Berlin tomorrow
  })

  it('takes the Berlin day on the 23-hour day the clocks go forward', () => {
    const now = at('2024-03-31T12:00:00Z')

    expect(sessionsToday([at('2024-03-30T23:00:00Z')], now)).toBe(1) // 00:00 CET
    expect(sessionsToday([at('2024-03-30T22:59:00Z')], now)).toBe(0)
    expect(sessionsToday([at('2024-03-31T21:59:00Z')], now)).toBe(1) // 23:59 CEST
    expect(sessionsToday([at('2024-03-31T22:00:00Z')], now)).toBe(0) // 00:00 CEST tomorrow
  })

  it('takes the Berlin day on the 25-hour day the clocks go back', () => {
    const now = at('2024-10-27T12:00:00Z')

    expect(sessionsToday([at('2024-10-26T22:00:00Z')], now)).toBe(1) // 00:00 CEST
    expect(sessionsToday([at('2024-10-26T21:59:00Z')], now)).toBe(0)
    expect(sessionsToday([at('2024-10-27T22:59:00Z')], now)).toBe(1) // 23:59 CET
    expect(sessionsToday([at('2024-10-27T23:00:00Z')], now)).toBe(0) // 00:00 CET tomorrow
  })
})

describe('deployCheck', () => {
  const now = at('2024-01-15T10:00:00Z')
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000)

  /** A Session of `event`, dated `startsAt`; `running` is its start while it runs. */
  const session = (event: string, startsAt: Date | null, { number = null, running = null }: { number?: number | null, running?: Date | null } = {}): CheckedSession =>
    ({ eventId: `event-${event}`, sessionId: `session-${event}-${number ?? 0}`, number, startsAt, runningSince: running })

  it('is ok, without a reason, when no Session is dated today', () => {
    const sessions = [session('freitag', at('2024-01-14T19:00:00Z'), { number: 1 }), session('freitag', at('2024-01-16T19:00:00Z'), { number: 2 }), session('offen', null)]

    expect(deployCheck({ sessions, now })).toEqual({ ok: true, reason: null })
  })

  it('is not ok on a game day and names how many Sessions fall on it, and which', () => {
    const one = deployCheck({ sessions: [session('solo', at('2024-01-15T19:00:00Z'))], now })
    const two = deployCheck({ sessions: [session('freitag', at('2024-01-15T17:00:00Z'), { number: 2 }), session('samstag', at('2024-01-15T19:00:00Z'))], now })

    expect(one).toEqual({ ok: false, reason: expect.stringContaining('game day') })
    expect(one.reason).toContain('1 Session is dated today')
    expect(one.reason).toContain('(the Session `session-solo-0` of Event `event-solo`)')
    expect(two.reason).toContain('2 Sessions are dated today')
    expect(two.reason).toContain('(Session 2 `session-freitag-2` of Event `event-freitag`, the Session `session-samstag-0` of Event `event-samstag`)')
  })

  it('is not ok while a Session runs (#164), with a reason of its own that names it, whatever day its Date was', () => {
    const running = deployCheck({ sessions: [session('freitag', at('2024-01-10T19:00:00Z'), { number: 1, running: hoursAgo(2) })], now })

    expect(running).toEqual({ ok: false, reason: expect.stringContaining('running') })
    expect(running.reason).toContain('1 Session is running (Session 1 `session-freitag-1` of Event `event-freitag`)')
    expect(running.reason).not.toContain('game day')
    const both = deployCheck({ sessions: [session('a', null, { running: hoursAgo(1) }), session('b', null, { running: hoursAgo(2) })], now })
    expect(both.reason).toContain('2 Sessions are running (the Session `session-a-0` of Event `event-a`, the Session `session-b-0` of Event `event-b`)')
  })

  it('names the running Session first when one runs on a game day', () => {
    const both = deployCheck({ sessions: [session('freitag', at('2024-01-15T19:00:00Z'), { running: hoursAgo(2) })], now })

    expect(both.ok).toBe(false)
    expect(both.reason).toContain('running')
  })

  it('is not ok while a Session started less than 16 h ago runs, and says so (#200)', () => {
    const justUnder = new Date(now.getTime() - (16 * 3_600_000 - 60_000)) // 15 h 59 min ago

    const body = deployCheck({ sessions: [session('freitag', null, { running: justUnder })], now })

    expect(body).toEqual({ ok: false, reason: expect.stringContaining('running') })
  })

  it('is ok when the Running Session started exactly 16 h ago or 3 days ago and no Session is dated today (#200)', () => {
    expect(deployCheck({ sessions: [session('freitag', null, { running: hoursAgo(16) })], now })).toEqual({ ok: true, reason: null })
    expect(deployCheck({ sessions: [session('freitag', at('2024-01-12T19:00:00Z'), { running: hoursAgo(72) })], now })).toEqual({ ok: true, reason: null })
  })

  it('counts only the Running Sessions that started less than 16 h ago (#200)', () => {
    const sessions = [session('a', null, { running: hoursAgo(2) }), session('b', null, { running: hoursAgo(16) }), session('c', null, { running: hoursAgo(40) })]

    const body = deployCheck({ sessions, now })

    expect(body.ok).toBe(false)
    expect(body.reason).toContain('1 Session is running (the Session `session-a-0` of Event `event-a`)')
  })

  it('names the game day, not the running Session, when a Session started 17 h ago runs on a game day (#200)', () => {
    const body = deployCheck({ sessions: [session('freitag', at('2024-01-15T19:00:00Z'), { running: hoursAgo(17) })], now })

    expect(body.ok).toBe(false)
    expect(body.reason).toContain('game day')
    expect(body.reason).not.toContain('running')
  })
})
