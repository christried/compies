import { describe, expect, it } from 'vitest'
import { fullestTeam, moveRejection, placeOf, teamChoiceOpen, type MoveCheck, type Place } from '../../shared/board'
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
