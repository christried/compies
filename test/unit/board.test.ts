import { describe, expect, it } from 'vitest'
import { composedTeamName, moveRejection, parsePlace, placeOf, teamChoiceOpen, composeTeamName, teamWords, type MoveCheck, type Place } from '../../shared/board'
import type { EventSettings } from '../../shared/settings'
import { defaultSettings } from '../../shared/settings'

// The Game board rules (#160, spec #153 § Game board rules module): when Team choice is open and who may move whom where.

const settings: EventSettings = { ...defaultSettings(), teamCount: 3, teamSize: 2 }
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
  /** A Player moving themselves from the Stands into team 1 while Team choice is open and nobody sits anywhere. */
  const base: MoveCheck = {
    actorId: 'p1',
    actorIsHost: false,
    userId: 'p1',
    from: stands,
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

  it('refuses a Player who moves someone else, also to the Stands', () => {
    expect(check({ userId: 'p2' })).toBe('host_only')
    expect(check({ userId: 'p2', to: stands })).toBe('host_only')
  })

  it('lets the Host move anyone', () => {
    expect(check({ actorId: 'h', actorIsHost: true, userId: 'p2' })).toBeNull()
  })

  it('refuses a move to the place the Member is in', () => {
    expect(check({ from: team(1), to: team(1) })).toBe('already_there')
    expect(check({ from: stands, to: stands })).toBe('already_there')
  })

  it('names host_only before already_there', () => {
    expect(check({ userId: 'p2', from: stands, to: stands })).toBe('host_only')
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
    expect(check({ teamChoiceOpen: false, from: team(1), to: stands })).toBe('team_choice_closed')
    expect(check({ teamChoiceOpen: false, from: team(1), to: team(2) })).toBe('team_choice_closed')
  })

  it('says teams_locked instead once the first Session has started', () => {
    expect(check({ teamChoiceOpen: false, started: true })).toBe('teams_locked')
    expect(check({ teamChoiceOpen: false, started: true, from: team(1), to: stands })).toBe('teams_locked')
  })

  it('lets the Host move into and out of teams at any time', () => {
    expect(check({ actorIsHost: true, teamChoiceOpen: false })).toBeNull()
    expect(check({ actorIsHost: true, teamChoiceOpen: false, started: true })).toBeNull()
    expect(check({ actorIsHost: true, teamChoiceOpen: false, from: team(1), to: stands })).toBeNull()
  })

  it('lets a Player go from the Stands into a team and back while Team choice is open', () => {
    expect(check({ from: stands, to: team(1) })).toBeNull()
    expect(check({ from: team(1), to: stands })).toBeNull()
  })

  it('refuses a Player the Stands-to-team move before Team choice opens, and after the first start both ways (#437)', () => {
    expect(check({ teamChoiceOpen: false, from: stands, to: team(1) })).toBe('team_choice_closed')
    expect(check({ teamChoiceOpen: false, started: true, from: stands, to: team(1) })).toBe('teams_locked')
    expect(check({ teamChoiceOpen: false, started: true, from: team(1), to: stands })).toBe('teams_locked')
  })

  it('lets the Host move anyone after the start within the Team size, and refuses past it', () => {
    expect(check({ actorIsHost: true, userId: 'p2', teamChoiceOpen: false, started: true, from: stands, to: team(1), seats: { 1: 1 } })).toBeNull()
    expect(check({ actorIsHost: true, userId: 'p2', teamChoiceOpen: false, started: true, from: stands, to: team(1), seats: { 1: 2 } })).toBe('team_full')
  })

  it('refuses a move to the Stands for somebody already there, also for a stored legacy bench seat (read as the Stands)', () => {
    expect(check({ from: placeOf({ zone: 'bench', team: null }), to: stands })).toBe('already_there')
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
    expect(placeOf({ zone: 'stands', team: null })).toEqual(stands)
    expect(placeOf({ zone: 'team', team: 3 })).toEqual(team(3))
  })

  it('reads a stored legacy bench seat as the Stands (the deployment before 0.12 still writes it, #437)', () => {
    expect(placeOf({ zone: 'bench', team: null })).toEqual(stands)
  })

  it('reads a team row without a team as the Stands (defensive: the table check makes it impossible)', () => {
    expect(placeOf({ zone: 'team', team: null })).toEqual(stands)
  })
})

describe('parsePlace', () => {
  it('reads the Stands and a legacy bench request (an old tab) as the Stands', () => {
    expect(parsePlace({ zone: 'stands' })).toEqual(stands)
    expect(parsePlace({ zone: 'bench' })).toEqual(stands)
  })

  it('reads a team by its whole position', () => {
    expect(parsePlace({ zone: 'team', team: 2 })).toEqual(team(2))
    expect(parsePlace({ zone: 'team', team: 1.5 })).toBeNull()
    expect(parsePlace({ zone: 'team' })).toBeNull()
  })

  it('refuses everything else', () => {
    expect(parsePlace({ zone: 'moon' })).toBeNull()
    expect(parsePlace('stands')).toBeNull()
    expect(parsePlace(null)).toBeNull()
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

describe('composeTeamName', () => {
  const member = (team: number | null, teamWord: string | null, joined: number) => ({ team, teamWord, teamJoinedAt: new Date(joined) })
  const members = [member(1, 'Gurken', 5), member(1, 'Wilde', 1), member(2, 'Hasen', 2), member(null, 'Stray', 0), member(1, null, 3)]

  it('composes the name of one team from its Members\' words, in the order they joined', () => {
    expect(composeTeamName(members, 1)).toBe('Wilde Gurken')
    expect(composeTeamName(members, 2)).toBe('Hasen')
  })

  it('is null for a team without words, so the colour name shows', () => {
    expect(composeTeamName(members, 3)).toBeNull()
  })

  it('gives the frozen name when there is one, also null for a reset name', () => {
    expect(composeTeamName(members, 1, 'Alte Hasen')).toBe('Alte Hasen')
    expect(composeTeamName(members, 1, null)).toBeNull()
  })
})
