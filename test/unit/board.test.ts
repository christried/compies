import { describe, expect, it } from 'vitest'
import { composedTeamName, fullestTeam, hasStarted, moveRejection, nextSession, placeOf, runningOf, startRejection, teamChoiceOpen, teamWords, type MoveCheck, type Place, type StartInput, type StartSession } from '../../shared/board'
import type { EventSettings } from '../../shared/settings'
import { defaultSettings } from '../../shared/settings'

// The Game board rules (#160, spec #153 § Game board rules module): when Team choice is open and who may move whom where.

const settings: EventSettings = { ...defaultSettings(), teamCount: 3, teamSize: 2 }
const bench: Place = { zone: 'bench' }
const stands: Place = { zone: 'stands' }
const team = (n: number): Place => ({ zone: 'team', team: n })

describe('teamChoiceOpen', () => {
  it('is open when settings exist, a Session has a Date and the first Session has not started', () => {
    expect(teamChoiceOpen({ settings, hasDatedSession: true, started: false })).toBe(true)
  })

  it('is closed without settings', () => {
    expect(teamChoiceOpen({ settings: null, hasDatedSession: true, started: false })).toBe(false)
  })

  it('is closed while no Session has a Date (the poll)', () => {
    expect(teamChoiceOpen({ settings, hasDatedSession: false, started: false })).toBe(false)
  })

  it('is closed once the first Session has started', () => {
    expect(teamChoiceOpen({ settings, hasDatedSession: true, started: true })).toBe(false)
  })
})

describe('moveRejection', () => {
  /** A Player moving themselves from the Bench into team 1 while Team choice is open and nobody sits anywhere. */
  const base: MoveCheck = {
    actorId: 'p1',
    actorIsHost: false,
    userId: 'p1',
    from: bench,
    to: team(1),
    settings,
    teamChoiceOpen: true,
    started: false,
    seats: {},
  }
  const check = (change: Partial<MoveCheck>) => moveRejection({ ...base, ...change })

  it('lets a Player move themselves into a team while Team choice is open', () => {
    expect(check({})).toBeNull()
  })

  it('refuses a Player who moves someone else, also between Bench and Stands', () => {
    expect(check({ userId: 'p2' })).toBe('host_only')
    expect(check({ userId: 'p2', to: stands })).toBe('host_only')
  })

  it('lets the Host move anyone', () => {
    expect(check({ actorId: 'h', actorIsHost: true, userId: 'p2' })).toBeNull()
  })

  it('refuses a move to the place the Member is in', () => {
    expect(check({ from: team(1), to: team(1) })).toBe('already_there')
    expect(check({ from: bench, to: bench })).toBe('already_there')
    expect(check({ from: stands, to: stands })).toBe('already_there')
  })

  it('names host_only before already_there', () => {
    expect(check({ userId: 'p2', from: bench, to: bench })).toBe('host_only')
  })

  it('refuses a team that does not exist, also for the Host', () => {
    expect(check({ to: team(4) })).toBe('no_such_team')
    expect(check({ to: team(0) })).toBe('no_such_team')
    expect(check({ actorIsHost: true, to: team(4) })).toBe('no_such_team')
  })

  it('refuses every team of an Event without settings', () => {
    expect(check({ settings: null, teamChoiceOpen: false, to: team(1) })).toBe('no_such_team')
    expect(check({ actorIsHost: true, settings: null, teamChoiceOpen: false, to: team(1) })).toBe('no_such_team')
  })

  it('refuses a Player while Team choice is closed, into a team and out of one', () => {
    expect(check({ teamChoiceOpen: false })).toBe('team_choice_closed')
    expect(check({ teamChoiceOpen: false, from: team(1), to: bench })).toBe('team_choice_closed')
    expect(check({ teamChoiceOpen: false, from: team(1), to: team(2) })).toBe('team_choice_closed')
  })

  it('says teams_locked instead once the first Session has started', () => {
    expect(check({ teamChoiceOpen: false, started: true })).toBe('teams_locked')
    expect(check({ teamChoiceOpen: false, started: true, from: team(1), to: stands })).toBe('teams_locked')
  })

  it('lets the Host move into and out of teams at any time', () => {
    expect(check({ actorIsHost: true, teamChoiceOpen: false })).toBeNull()
    expect(check({ actorIsHost: true, teamChoiceOpen: false, started: true })).toBeNull()
    expect(check({ actorIsHost: true, teamChoiceOpen: false, from: team(1), to: bench })).toBeNull()
  })

  it('always lets a Player go between Bench and Stands', () => {
    for (const state of [{ teamChoiceOpen: false }, { teamChoiceOpen: false, started: true }, { settings: null, teamChoiceOpen: false }]) {
      expect(check({ ...state, from: bench, to: stands })).toBeNull()
      expect(check({ ...state, from: stands, to: bench })).toBeNull()
    }
  })

  it('refuses a full team at the Team size', () => {
    expect(check({ seats: { 1: 2 } })).toBe('team_full')
    expect(check({ seats: { 1: 1 } })).toBeNull()
    expect(check({ seats: { 1: 2 }, from: team(2), to: team(1) })).toBe('team_full')
  })

  it('limits the Host by the Team size too', () => {
    expect(check({ actorIsHost: true, userId: 'p2', seats: { 1: 2 } })).toBe('team_full')
  })

  it('does not count the other teams against the target team', () => {
    expect(check({ seats: { 2: 2, 3: 2 } })).toBeNull()
  })
})

describe('placeOf', () => {
  it('reads the zone and, for a team, its position', () => {
    expect(placeOf({ zone: 'bench', team: null })).toEqual(bench)
    expect(placeOf({ zone: 'stands', team: null })).toEqual(stands)
    expect(placeOf({ zone: 'team', team: 3 })).toEqual(team(3))
  })
})

describe('fullestTeam', () => {
  it('is the Player count of the fullest team', () => {
    expect(fullestTeam({ 1: 1, 2: 3, 3: 2 })).toBe(3)
  })

  it('is 0 without Players in teams', () => {
    expect(fullestTeam({})).toBe(0)
  })
})

describe('composedTeamName', () => {
  it('joins the words in the order given, with one space', () => {
    expect(composedTeamName({ words: ['Wilde', 'Gurken'] })).toBe('Wilde Gurken')
  })

  it('is null without words, so the client shows the Team colour name', () => {
    expect(composedTeamName({ words: [] })).toBeNull()
  })

  it('lets a word leave with its Player', () => {
    const seats = [
      { word: 'Wilde', joinedAt: 1 },
      { word: 'Gurken', joinedAt: 2 },
      { word: 'Bande', joinedAt: 3 },
    ]
    expect(composedTeamName({ words: teamWords(seats) })).toBe('Wilde Gurken Bande')
    expect(composedTeamName({ words: teamWords(seats.filter(seat => seat.word !== 'Gurken')) })).toBe('Wilde Bande')
  })

  it('orders the words by when their Players joined and skips Players without a word', () => {
    const seats = [
      { word: 'Gurken', joinedAt: 5 },
      { word: null, joinedAt: 2 },
      { word: 'Wilde', joinedAt: 1 },
    ]
    expect(composedTeamName({ words: teamWords(seats) })).toBe('Wilde Gurken')
  })

  it('lets a frozen name win over the words', () => {
    expect(composedTeamName({ frozen: 'Alte Hasen', words: ['Wilde', 'Gurken'] })).toBe('Alte Hasen')
  })

  it('lets a frozen name win even when the team has no words', () => {
    expect(composedTeamName({ frozen: 'Alte Hasen', words: [] })).toBe('Alte Hasen')
  })

  it('composes from the words when nothing is frozen (frozen is undefined)', () => {
    expect(composedTeamName({ frozen: undefined, words: ['Wilde'] })).toBe('Wilde')
  })

  it('gives null for a frozen null even when words exist, so the colour name shows', () => {
    expect(composedTeamName({ frozen: null, words: ['Wilde', 'Gurken'] })).toBeNull()
  })
})

const at = (hour: number) => Date.UTC(2026, 10, 7, hour)
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
