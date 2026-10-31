import { describe, expect, it } from 'vitest'
import { deployCheck, sessionsToday } from '../../server/domain/game-day'

// The game-day rule behind the Worker deploy guard (#157): a deploy drops every socket, so it must not happen on a day
// a Session is dated. "Today" is the Berlin calendar day (ADR 0003), whatever the server's clock zone.
const at = (iso: string) => new Date(iso)

describe('sessionsToday', () => {
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

  it('is ok, without a reason, when no Session is dated today', () => {
    expect(deployCheck({ startsAt: [at('2024-01-14T19:00:00Z'), at('2024-01-16T19:00:00Z'), null], runningSince: [], now })).toEqual({ ok: true, reason: null })
  })

  it('is not ok on a game day and names how many Sessions fall on it', () => {
    const one = deployCheck({ startsAt: [at('2024-01-15T19:00:00Z')], runningSince: [], now })
    const two = deployCheck({ startsAt: [at('2024-01-15T17:00:00Z'), at('2024-01-15T19:00:00Z')], runningSince: [], now })

    expect(one).toEqual({ ok: false, reason: expect.stringContaining('game day') })
    expect(one.reason).toContain('1 Session')
    expect(two.reason).toContain('2 Sessions')
  })

  it('is not ok while a Session runs (#164), with a reason of its own, whatever day its Date was', () => {
    const running = deployCheck({ startsAt: [at('2024-01-10T19:00:00Z')], runningSince: [hoursAgo(2)], now })

    expect(running).toEqual({ ok: false, reason: expect.stringContaining('running') })
    expect(running.reason).not.toContain('game day')
    expect(deployCheck({ startsAt: [], runningSince: [hoursAgo(1), hoursAgo(2)], now }).reason).toContain('2 Sessions are running')
  })

  it('names the running Session first when one runs on a game day', () => {
    const both = deployCheck({ startsAt: [at('2024-01-15T19:00:00Z')], runningSince: [hoursAgo(2)], now })

    expect(both.ok).toBe(false)
    expect(both.reason).toContain('running')
  })

  it('is not ok while a Session started less than 16 h ago runs, and says so (#200)', () => {
    const justUnder = new Date(now.getTime() - (16 * 3_600_000 - 60_000)) // 15 h 59 min ago

    const body = deployCheck({ startsAt: [], runningSince: [justUnder], now })

    expect(body).toEqual({ ok: false, reason: expect.stringContaining('running') })
  })

  it('is ok when the Running Session started exactly 16 h ago or 3 days ago and no Session is dated today (#200)', () => {
    expect(deployCheck({ startsAt: [], runningSince: [hoursAgo(16)], now })).toEqual({ ok: true, reason: null })
    expect(deployCheck({ startsAt: [at('2024-01-12T19:00:00Z')], runningSince: [hoursAgo(72)], now })).toEqual({ ok: true, reason: null })
  })

  it('counts only the Running Sessions that started less than 16 h ago (#200)', () => {
    const body = deployCheck({ startsAt: [], runningSince: [hoursAgo(2), hoursAgo(16), hoursAgo(40)], now })

    expect(body.ok).toBe(false)
    expect(body.reason).toContain('1 Session is running')
  })

  it('names the game day, not the running Session, when a Session started 17 h ago runs on a game day (#200)', () => {
    const body = deployCheck({ startsAt: [at('2024-01-15T19:00:00Z')], runningSince: [hoursAgo(17)], now })

    expect(body.ok).toBe(false)
    expect(body.reason).toContain('game day')
    expect(body.reason).not.toContain('running')
  })
})
