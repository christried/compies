import { describe, expect, it } from 'vitest'
import { hasStarted, isRunning, nextSession, runningOf, sessionState, startRejection, teamsRejection, type SessionTimes, type StartInput } from '../../shared/session-state'
import type { EventSettings } from '../../shared/settings'
import { defaultSettings } from '../../shared/settings'

// A Session's state and the start rule (#164, #226, spec #153 § Game board rules module): which of undated, set, running
// and ended a Session is in, whether any has started, which one is next and why the next one cannot start.

const settings: EventSettings = { ...defaultSettings(), teamCount: 3, teamSize: 2 }

const at = (hour: number) => Date.UTC(2026, 10, 7, hour)
type StartSession = SessionTimes & { id: string }
const session = (id: string, fields: Partial<StartSession> = {}): StartSession => ({ id, startsAt: at(18), startedAt: null, endedAt: null, ...fields })

describe('nextSession', () => {
  it('is the earliest dated Session that has not started, whatever order they come in', () => {
    const sessions = [
      session('undated', { startsAt: null }),
      session('done', { startsAt: at(10), startedAt: at(10), endedAt: at(12) }),
      session('later', { startsAt: at(20) }),
      session('earlier', { startsAt: at(14) }),
    ]
    expect(nextSession(sessions)?.id).toBe('earlier')
  })

  it('is null when every dated Session has started or none is dated', () => {
    expect(nextSession([session('a', { startsAt: null }), session('b', { startedAt: at(18) })])).toBeNull()
    expect(nextSession([])).toBeNull()
  })

  it('does not look at the clock: a Date far in the future can start early', () => {
    expect(nextSession([session('future', { startsAt: Date.UTC(2099, 0, 1) })])?.id).toBe('future')
  })

  // The server reads Dates from rows and the client ISO strings from the Event read: one rule for all of them.
  it('compares Dates and ISO strings the way it compares numbers', () => {
    const row = (id: string, startsAt: Date | null, startedAt: Date | null = null) => ({ id, startsAt, startedAt })
    expect(nextSession([row('later', new Date(at(20))), row('earlier', new Date(at(14))), row('done', new Date(at(10)), new Date(at(10)))])?.id).toBe('earlier')
    const view = (id: string, startsAt: string | null, startedAt: string | null = null) => ({ id, startsAt, startedAt })
    expect(nextSession([view('later', new Date(at(20)).toISOString()), view('earlier', new Date(at(14)).toISOString()), view('undated', null)])?.id).toBe('earlier')
  })
})

describe('hasStarted and runningOf', () => {
  const view = (id: string, startedAt: string | null, endedAt: string | null = null) => ({ id, startedAt, endedAt })

  it('say whether any Session has started, also one that has ended', () => {
    expect(hasStarted([])).toBe(false)
    expect(hasStarted([view('a', null)])).toBe(false)
    expect(hasStarted([view('a', null), view('b', '2026-11-07T18:00:00.000Z', '2026-11-07T20:00:00.000Z')])).toBe(true)
  })

  it('finds the Session that is started and not ended', () => {
    const running = view('b', '2026-11-07T18:00:00.000Z')
    expect(runningOf([view('a', null), running, view('c', '2026-11-06T18:00:00.000Z', '2026-11-06T20:00:00.000Z')])).toBe(running)
    expect(runningOf([view('a', null), view('c', '2026-11-06T18:00:00.000Z', '2026-11-06T20:00:00.000Z')])).toBeUndefined()
    expect(runningOf([])).toBeUndefined()
  })
})

describe('startRejection', () => {
  const ready: StartInput = {
    settings,
    sessions: [session('one')],
    seats: { 1: 2, 2: 2, 3: 2 },
  }

  it('is null when the Event is set up, a Session is dated and every team has the same number of Players', () => {
    expect(startRejection(ready)).toBeNull()
  })

  it('says not_set_up without settings, before anything else', () => {
    expect(startRejection({ ...ready, settings: null, sessions: [session('one', { startedAt: at(18) })], seats: {} })).toBe('not_set_up')
  })

  it('says session_running while a Session has started and not ended', () => {
    expect(startRejection({ ...ready, sessions: [session('one', { startedAt: at(18) }), session('two', { startsAt: at(20) })] })).toBe('session_running')
  })

  it('does not count an ended Session as running', () => {
    expect(startRejection({ ...ready, sessions: [session('one', { startedAt: at(18), endedAt: at(20) }), session('two', { startsAt: at(22) })] })).toBeNull()
  })

  it('says no_dated_session when no dated Session is left to start', () => {
    expect(startRejection({ ...ready, sessions: [session('one', { startsAt: null })] })).toBe('no_dated_session')
    expect(startRejection({ ...ready, sessions: [session('one', { startedAt: at(18), endedAt: at(19) })] })).toBe('no_dated_session')
  })

  it('says teams_empty when a team position has no Player, also when the others are full', () => {
    expect(startRejection({ ...ready, seats: { 1: 2, 3: 2 } })).toBe('teams_empty')
    expect(startRejection({ ...ready, seats: {} })).toBe('teams_empty')
  })

  it('says teams_uneven when the teams differ in size', () => {
    expect(startRejection({ ...ready, seats: { 1: 2, 2: 1, 3: 2 } })).toBe('teams_uneven')
  })

  it('names the first reason in the order not_set_up, session_running, no_dated_session, teams_empty, teams_uneven', () => {
    const running = session('run', { startedAt: at(18) })
    expect(startRejection({ settings, sessions: [running, session('x', { startsAt: null })], seats: {} })).toBe('session_running')
    expect(startRejection({ settings, sessions: [session('x', { startsAt: null })], seats: {} })).toBe('no_dated_session')
    expect(startRejection({ settings, sessions: [session('x')], seats: { 1: 1 } })).toBe('teams_empty')
  })
})

describe('sessionState', () => {
  it('is undated while the Session has no Date', () => {
    expect(sessionState(session('a', { startsAt: null }))).toBe('undated')
  })

  it('is set once it has its Date and has not started', () => {
    expect(sessionState(session('a'))).toBe('set')
  })

  it('is running once the Host started it, and ended once the Host ended it', () => {
    expect(sessionState(session('a', { startedAt: at(18) }))).toBe('running')
    expect(sessionState(session('a', { startedAt: at(18), endedAt: at(20) }))).toBe('ended')
  })

  it('reads Dates and ISO strings like numbers', () => {
    expect(sessionState({ startsAt: new Date(at(18)), startedAt: new Date(at(18)), endedAt: null })).toBe('running')
    expect(sessionState({ startsAt: '2026-11-07T18:00:00.000Z', startedAt: null, endedAt: null })).toBe('set')
  })
})

describe('hasStarted and isRunning with every kind of instant', () => {
  it('count a start as a Date, a number or an ISO string, and no start as null', () => {
    expect(hasStarted([{ startedAt: null }])).toBe(false)
    expect(hasStarted([{ startedAt: new Date(at(18)) }])).toBe(true)
    expect(hasStarted([{ startedAt: at(18) }])).toBe(true)
    expect(hasStarted([{ startedAt: '2026-11-07T18:00:00.000Z' }])).toBe(true)
    expect(isRunning({ startedAt: 0, endedAt: null })).toBe(true)
    expect(isRunning({ startedAt: 0, endedAt: 0 })).toBe(false)
    expect(isRunning({ startedAt: null, endedAt: null })).toBe(false)
  })
})

describe('teamsRejection (#228)', () => {
  it('lets teams play when every team has the same number of Players', () => {
    expect(teamsRejection(3, { 1: 2, 2: 2, 3: 2 })).toBeNull()
  })

  it('names a team without a Player first, then teams that differ in size', () => {
    expect(teamsRejection(3, { 1: 2, 2: 2 })).toBe('teams_empty')
    expect(teamsRejection(2, { 1: 3, 2: 2 })).toBe('teams_uneven')
    expect(teamsRejection(2, { 1: 3 })).toBe('teams_empty')
  })

  it('looks at the teams the Event has, not at Players seated in teams past the count', () => {
    expect(teamsRejection(2, { 1: 2, 2: 2, 5: 1 })).toBeNull()
  })
})
