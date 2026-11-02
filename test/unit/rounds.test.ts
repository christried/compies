import { describe, expect, it } from 'vitest'
import { VETO_WINDOW_MS, drawOutcome, gamesLeft, isBeingDrawn, isOpen, opensWindow, roundsStarted, roundState, setRejection, spinRejection, vetoRejection, vetoesLeftByParty, waitsForRespin, type DrawFacts, type RoundFacts, type SetInput, type SpinInput, type VetoInput } from '../../shared/rounds'
import type { SessionTimes } from '../../shared/session-state'
import { floorsAt } from '../../shared/settings'

// The round rules (#228, spec #218 § Rounds): the games left in the Game pool, a Round's state, how many Rounds have
// started (the Game count's floor) and why the Host cannot set the next game now.

const at = (hour: number) => Date.UTC(2090, 10, 7, hour)

const round = (id: string, fields: Partial<RoundFacts> = {}): RoundFacts => ({ id, setAt: at(19), putBackAt: null, ...fields })
const draw = (roundId: string, gameId: string, fields: Partial<DrawFacts> = {}): DrawFacts => ({ roundId, gameId, source: 'pool', outcome: 'set', ...fields })
const open = (roundId: string): DrawFacts => draw(roundId, 'halo', { outcome: null })
const vetoed = (roundId: string, gameId = 'halo'): DrawFacts => draw(roundId, gameId, { outcome: 'vetoed' })

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
  const facts = { playersPerTeam: [2, 3], roundsStarted: 4, vetoesSpent: 0 }

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
    draws: [],
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
    expect(setRejection(input({ rounds: [round('a', { setAt: null })], draws: [open('a')] }))).toBe('round_being_drawn')
  })

  it('names the first reason in this order: Host, running Session, teams, Game count, a Round being drawn', () => {
    const drawn = [round('a'), round('b'), round('c', { setAt: null })]
    const worst = input({ isHost: false, sessions: [], seats: { 1: 1, 2: 2 }, rounds: drawn, draws: [open('c')] })

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
    draws: [],
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
    expect(spinRejection(input({ rounds: [round('a', { setAt: null })], draws: [open('a')] }))).toBe('round_being_drawn')
  })

  it('refuses Host pick: there is no wheel to spin', () => {
    expect(spinRejection(input({ settings: { teamCount: 2, gameCount: 3, selectionMode: 'admin_pick' } }))).toBe('no_wheel')
  })

  it('refuses an empty wheel, after every reason of setting a game', () => {
    expect(spinRejection(input({ left: [] }))).toBe('pool_empty')
    expect(spinRejection(input({ left: [], rounds: [round('a', { setAt: null })], draws: [open('a')] }))).toBe('round_being_drawn')
  })
})

describe('Vetoes left', () => {
  it('is the Veto allowance plus the Bonus Vetoes of the Party, minus the Vetoes it cast', () => {
    const ledger = { allowance: 3, teamCount: 3, bonusTeams: [2, 2], castTeams: [1, 2, 2, 2] }

    expect(vetoesLeftByParty(ledger)).toEqual([2, 2, 3])
  })

  it('counts every Veto cast, settled or not: a Veto spent in a put-back Round stays spent', () => {
    // The ledger knows team numbers only: which draw or Round a Veto sits in does not change what it spent.
    expect(vetoesLeftByParty({ allowance: 2, teamCount: 2, bonusTeams: [], castTeams: [1, 1] })).toEqual([0, 2])
  })

  it('has none without an allowance (Host pick) and never drops below zero', () => {
    expect(vetoesLeftByParty({ allowance: null, teamCount: 2, bonusTeams: [], castTeams: [] })).toEqual([0, 0])
    expect(vetoesLeftByParty({ allowance: 1, teamCount: 1, bonusTeams: [], castTeams: [1, 1] })).toEqual([0])
  })
})

describe('opensWindow', () => {
  it('opens when some Party has a Veto left', () => {
    expect(opensWindow([0, 1])).toBe(true)
    expect(opensWindow([2, 3])).toBe(true)
  })

  it('does not open when no Party has one', () => {
    expect(opensWindow([0, 0])).toBe(false)
    expect(opensWindow([])).toBe(false)
  })
})

describe('drawOutcome', () => {
  it('is vetoed with any Veto and set with none', () => {
    expect(drawOutcome(0)).toBe('set')
    expect(drawOutcome(1)).toBe('vetoed')
    expect(drawOutcome(3)).toBe('vetoed')
  })
})

describe('the Veto window', () => {
  it('lasts 60 seconds', () => {
    expect(VETO_WINDOW_MS).toBe(60_000)
  })
})

describe('vetoRejection', () => {
  const stopAt = at(19)
  const vetoEndsAt = stopAt + VETO_WINDOW_MS
  const open_ = { stopAt, vetoEndsAt, outcome: null }
  const input = (fields: Partial<VetoInput> = {}): VetoInput => ({
    viewerTeam: 1,
    draw: open_,
    now: stopAt + 1000,
    castTeams: [],
    left: 2,
    ...fields,
  })

  it('lets a Player of a Party with a Veto left cast one while the window is open', () => {
    expect(vetoRejection(input())).toBeNull()
  })

  it('refuses a viewer who is no Player: on the Bench, in the Stands or without a Member', () => {
    expect(vetoRejection(input({ viewerTeam: null }))).toBe('not_a_player')
  })

  it('refuses a draw without a window, and a draw that does not exist', () => {
    expect(vetoRejection(input({ draw: { stopAt, vetoEndsAt: null, outcome: 'set' } }))).toBe('no_veto_window')
    expect(vetoRejection(input({ draw: null }))).toBe('no_veto_window')
  })

  it('refuses from the end of the window on, to the millisecond, and before the stop', () => {
    expect(vetoRejection(input({ now: vetoEndsAt - 1 }))).toBeNull()
    expect(vetoRejection(input({ now: vetoEndsAt }))).toBe('veto_window_closed')
    expect(vetoRejection(input({ now: stopAt }))).toBeNull()
    expect(vetoRejection(input({ now: stopAt - 1 }))).toBe('veto_window_closed')
  })

  it('refuses a draw that has settled, whatever the clock says', () => {
    expect(vetoRejection(input({ draw: { stopAt, vetoEndsAt, outcome: 'vetoed' }, now: stopAt + 1 }))).toBe('veto_window_closed')
  })

  it('refuses a second Veto of the Party on the same draw, but not after another Party\'s', () => {
    expect(vetoRejection(input({ castTeams: [2, 1] }))).toBe('veto_already_cast')
    expect(vetoRejection(input({ castTeams: [2] }))).toBeNull()
  })

  it('refuses a Party without a Veto left', () => {
    expect(vetoRejection(input({ left: 0 }))).toBe('no_vetoes_left')
  })

  it('names the first reason in this order: Player, window, closed, already cast, none left', () => {
    const worst = input({ viewerTeam: null, draw: null, now: vetoEndsAt + 1, castTeams: [1], left: 0 })

    expect(vetoRejection(worst)).toBe('not_a_player')
    expect(vetoRejection({ ...worst, viewerTeam: 1 })).toBe('no_veto_window')
    expect(vetoRejection({ ...worst, viewerTeam: 1, draw: open_ })).toBe('veto_window_closed')
    expect(vetoRejection({ ...worst, viewerTeam: 1, draw: open_, now: stopAt })).toBe('veto_already_cast')
    expect(vetoRejection({ ...worst, viewerTeam: 1, draw: open_, now: stopAt, castTeams: [] })).toBe('no_vetoes_left')
  })
})

describe('a Round waiting for a respin', () => {
  it('stands, has no game, and has only vetoed draws', () => {
    const waiting = round('a', { setAt: null })

    expect(waitsForRespin(waiting, [vetoed('a'), vetoed('a', 'kart')])).toBe(true)
    expect(isBeingDrawn(waiting, [vetoed('a'), vetoed('a', 'kart')])).toBe(false)
  })

  it('is being drawn while a draw of it is open, also after an earlier draw was vetoed', () => {
    const drawn = round('a', { setAt: null })

    expect(isBeingDrawn(drawn, [open('a')])).toBe(true)
    expect(isBeingDrawn(drawn, [vetoed('a'), open('a')])).toBe(true)
    expect(waitsForRespin(drawn, [vetoed('a'), open('a')])).toBe(false)
  })

  it('is neither once its game is set, or when the Host put it back', () => {
    expect(waitsForRespin(round('a'), [vetoed('a'), draw('a', 'kart')])).toBe(false)
    expect(isBeingDrawn(round('a'), [draw('a', 'kart')])).toBe(false)
    expect(waitsForRespin(round('a', { setAt: null, putBackAt: at(20) }), [vetoed('a')])).toBe(false)
  })

  it('does not block setting or spinning, and adds no Round: the Game count does not refuse it', () => {
    const rounds = [round('a'), round('b'), round('c', { setAt: null })]
    const draws = [vetoed('c')]
    const sessions: SessionTimes[] = [{ startsAt: at(18), startedAt: at(19), endedAt: null }]
    const base = { isHost: true, sessions, seats: { 1: 2, 2: 2 }, rounds, draws }

    expect(setRejection({ ...base, settings: { teamCount: 2, gameCount: 3 } })).toBeNull()
    expect(spinRejection({ ...base, settings: { teamCount: 2, gameCount: 3, selectionMode: 'lucky_wheel' }, left: ['kart'] })).toBeNull()
    expect(spinRejection({ ...base, settings: { teamCount: 2, gameCount: 3, selectionMode: 'lucky_wheel' }, left: [] })).toBe('pool_empty')
  })
})
