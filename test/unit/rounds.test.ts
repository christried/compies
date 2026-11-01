import { describe, expect, it } from 'vitest'
import { gamesLeft, isOpen, roundsStarted, roundState, setRejection, spinRejection, type DrawFacts, type RoundFacts, type SetInput, type SpinInput } from '../../shared/rounds'
import type { SessionTimes } from '../../shared/session-state'
import { floorsAt } from '../../shared/settings'

// The round rules (#228, spec #218 § Rounds): the games left in the Game pool, a Round's state, how many Rounds have
// started (the Game count's floor) and why the Host cannot set the next game now.

const at = (hour: number) => Date.UTC(2090, 10, 7, hour)

const round = (id: string, fields: Partial<RoundFacts> = {}): RoundFacts => ({ id, setAt: at(19), putBackAt: null, ...fields })
const draw = (roundId: string, gameId: string, fields: Partial<DrawFacts> = {}): DrawFacts => ({ roundId, gameId, source: 'pool', outcome: 'set', ...fields })

describe('roundState', () => {
  it('is being drawn until the game is set, then set', () => {
    expect(roundState({ setAt: null })).toBe('drawn')
    expect(roundState({ setAt: at(19) })).toBe('set')
  })
})

describe('open Rounds and Rounds started', () => {
  it('counts a Round from its start until the Host puts it back, drawn or set', () => {
    const rounds = [round('a'), round('b', { setAt: null }), round('c', { putBackAt: at(20) })]

    expect(roundsStarted(rounds)).toBe(2)
  })

  it('lists a set Round that was not put back as open', () => {
    const rounds = [round('a'), round('b', { setAt: null }), round('c', { putBackAt: at(20) })]

    expect(rounds.filter(isOpen).map(row => row.id)).toEqual(['a'])
  })
})

describe('gamesLeft', () => {
  const pool = ['halo', 'kart', 'chess', 'uno']

  it('is the whole pool before any draw', () => {
    expect(gamesLeft(pool, [], [])).toEqual(pool)
  })

  it('takes a game out of the pool when it is set, played or open alike, and keeps the pool\'s order', () => {
    const rounds = [round('a'), round('b', { setAt: null })]

    expect(gamesLeft(pool, [draw('a', 'kart'), draw('b', 'uno', { outcome: null })], rounds)).toEqual(['halo', 'chess'])
  })

  it('puts a game back into the pool when the Round of a pool game is put back', () => {
    const rounds = [round('a', { putBackAt: at(20) })]

    expect(gamesLeft(pool, [draw('a', 'kart')], rounds)).toEqual(pool)
  })

  it('never returns a game from the library: it was never in the pool, so a put back leaves the pool as it is', () => {
    const rounds = [round('a', { putBackAt: at(20) })]

    expect(gamesLeft(pool, [draw('a', 'zelda', { source: 'library' })], rounds)).toEqual(pool)
  })

  it('does not let a put back return a pool game that another draw has taken', () => {
    const rounds = [round('a'), round('b', { putBackAt: at(20) })]

    expect(gamesLeft(pool, [draw('a', 'kart'), draw('b', 'kart', { source: 'library' })], rounds)).toEqual(['halo', 'chess', 'uno'])
  })

  it('counts a vetoed draw as gone for good, also when its Round was put back', () => {
    const rounds = [round('a', { putBackAt: at(20) })]
    const draws = [draw('a', 'kart', { outcome: 'vetoed' }), draw('a', 'uno')]

    expect(gamesLeft(pool, draws, rounds)).toEqual(['halo', 'chess', 'uno'])
  })

  it('ignores a drawn game that is not in the pool any more', () => {
    expect(gamesLeft(['halo'], [draw('a', 'removed')], [round('a')])).toEqual(['halo'])
  })
})

describe('the Game count floor', () => {
  const facts = { playersPerTeam: [2, 3], roundsStarted: 4 }

  it('is the Rounds started', () => {
    expect(floorsAt(facts, 2).gameCount).toBe(4)
    expect(floorsAt({ ...facts, roundsStarted: 0 }, 2).gameCount).toBe(0)
  })

  it('counts all teams of an Event that has not got a team count yet', () => {
    expect(floorsAt(facts).teamSize).toBe(3)
  })

  it('keeps the Team size floor of the teams that remain', () => {
    expect(floorsAt(facts, 1).teamSize).toBe(2)
  })
})

describe('setRejection', () => {
  const sessions: SessionTimes[] = [{ startsAt: at(18), startedAt: at(19), endedAt: null }]
  const input = (fields: Partial<SetInput> = {}): SetInput => ({
    isHost: true,
    settings: { teamCount: 2, gameCount: 3 },
    sessions,
    seats: { 1: 2, 2: 2 },
    rounds: [],
    ...fields,
  })

  it('lets the Host set the next game in a running Session with equal teams', () => {
    expect(setRejection(input())).toBeNull()
  })

  it('refuses anyone but the Host', () => {
    expect(setRejection(input({ isHost: false }))).toBe('not_host')
  })

  it('refuses without a running Session: none started, or the Session ended', () => {
    expect(setRejection(input({ sessions: [{ startsAt: at(18), startedAt: null, endedAt: null }] }))).toBe('no_running_session')
    expect(setRejection(input({ sessions: [{ startsAt: at(18), startedAt: at(19), endedAt: at(22) }] }))).toBe('no_running_session')
    expect(setRejection(input({ sessions: [] }))).toBe('no_running_session')
  })

  it('refuses an Event that is not set up', () => {
    expect(setRejection(input({ settings: null }))).toBe('not_set_up')
  })

  it('refuses uneven teams and empty teams, by the rule that starts a Session', () => {
    expect(setRejection(input({ seats: { 1: 2, 2: 1 } }))).toBe('teams_uneven')
    expect(setRejection(input({ seats: { 1: 2 } }))).toBe('teams_empty')
  })

  it('refuses once as many Rounds have started as the Game count, drawn ones and set ones alike', () => {
    const started = [round('a'), round('b', { setAt: null }), round('c')]

    expect(setRejection(input({ rounds: started }))).toBe('game_count_reached')
  })

  it('does not count a Round that was put back', () => {
    const rounds = [round('a'), round('b'), round('c', { putBackAt: at(20) })]

    expect(setRejection(input({ rounds }))).toBeNull()
  })

  it('refuses while a Round is being drawn', () => {
    expect(setRejection(input({ rounds: [round('a', { setAt: null })] }))).toBe('round_being_drawn')
  })

  it('names the first reason in this order: Host, running Session, teams, Game count, a Round being drawn', () => {
    const drawn = [round('a'), round('b'), round('c', { setAt: null })]
    const worst = input({ isHost: false, sessions: [], seats: { 1: 1, 2: 2 }, rounds: drawn })

    expect(setRejection(worst)).toBe('not_host')
    expect(setRejection({ ...worst, isHost: true })).toBe('no_running_session')
    expect(setRejection({ ...worst, isHost: true, sessions })).toBe('teams_uneven')
    expect(setRejection({ ...worst, isHost: true, sessions, seats: { 1: 2, 2: 2 } })).toBe('game_count_reached')
    expect(setRejection({ ...worst, isHost: true, sessions, seats: { 1: 2, 2: 2 }, settings: { teamCount: 2, gameCount: 9 } })).toBe('round_being_drawn')
  })
})

describe('spinRejection', () => {
  const sessions: SessionTimes[] = [{ startsAt: at(18), startedAt: at(19), endedAt: null }]
  const input = (fields: Partial<SpinInput> = {}): SpinInput => ({
    isHost: true,
    settings: { teamCount: 2, gameCount: 3, selectionMode: 'lucky_wheel' },
    sessions,
    seats: { 1: 2, 2: 2 },
    rounds: [],
    left: ['halo', 'kart'],
    ...fields,
  })

  it('lets the Host spin a Lucky Wheel with games left', () => {
    expect(spinRejection(input())).toBeNull()
  })

  it('gives the reasons of setting a game, in their order', () => {
    expect(spinRejection(input({ isHost: false }))).toBe('not_host')
    expect(spinRejection(input({ sessions: [] }))).toBe('no_running_session')
    expect(spinRejection(input({ seats: { 1: 2, 2: 1 } }))).toBe('teams_uneven')
    expect(spinRejection(input({ rounds: [round('a'), round('b'), round('c')] }))).toBe('game_count_reached')
    expect(spinRejection(input({ rounds: [round('a', { setAt: null })] }))).toBe('round_being_drawn')
  })

  it('refuses Host pick: there is no wheel to spin', () => {
    expect(spinRejection(input({ settings: { teamCount: 2, gameCount: 3, selectionMode: 'admin_pick' } }))).toBe('no_wheel')
  })

  it('refuses an empty wheel, after every reason of setting a game', () => {
    expect(spinRejection(input({ left: [] }))).toBe('pool_empty')
    expect(spinRejection(input({ left: [], rounds: [round('a', { setAt: null })] }))).toBe('round_being_drawn')
  })
})
