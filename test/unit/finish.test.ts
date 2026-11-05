import { describe, expect, it } from 'vitest'
import { endOf, finishRejection, lastGameRejection, leadersOf, outcomeOf, standingsAndEnd } from '../../shared/finish'
import { standingsOf } from '../../shared/results'
import { GAME_COUNT_MAX } from '../../shared/settings'

// The finish and last-game rules (#277, #278, review 0.8 Q12): the leaders, how far the Event is, the Tie, and the reasons the Host
// cannot finish or add the last game now. Moved from results.test.ts with shared/finish.ts; the cases are unchanged.

describe('leadersOf', () => {
  it('lists the one Party on rank 1', () => {
    expect(leadersOf(standingsOf([1, 3, 2]))).toEqual([2])
  })

  it('lists two Parties level on rank 1, in team order', () => {
    expect(leadersOf(standingsOf([2, 0, 2]))).toEqual([1, 3])
  })

  it('lists every Party when all are level', () => {
    expect(leadersOf(standingsOf([0, 0, 0, 0]))).toEqual([1, 2, 3, 4])
  })

  it('lists all eight Parties when eight are level', () => {
    expect(leadersOf(standingsOf([4, 4, 4, 4, 4, 4, 4, 4]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('endOf', () => {
  it('is not complete while fewer Rounds have a Result than the Game count, and a Tie needs completeness', () => {
    expect(endOf(standingsOf([1, 1, 0]), 2, 3)).toEqual({ played: 2, gameCount: 3, complete: false, tie: null })
  })

  it('is complete at the Game count with one leader, and has no Tie', () => {
    expect(endOf(standingsOf([2, 1, 0]), 2, 2)).toEqual({ played: 2, gameCount: 2, complete: true, tie: null })
  })

  it('names the two leaders as the Tie when complete and level on rank 1', () => {
    expect(endOf(standingsOf([1, 1, 0]), 2, 2)).toEqual({ played: 2, gameCount: 2, complete: true, tie: [1, 2] })
  })

  it('names three of four level Parties on rank 1, in team order', () => {
    expect(endOf(standingsOf([3, 3, 0, 3]), 3, 3).tie).toEqual([1, 2, 4])
  })

  it('names every Party of an all-level Event with eight Parties', () => {
    expect(endOf(standingsOf([2, 2, 2, 2, 2, 2, 2, 2]), 1, 1).tie).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('counts a played number above the Game count as complete (defensive)', () => {
    expect(endOf(standingsOf([2, 0]), 3, 2)).toMatchObject({ complete: true, tie: null })
  })

  it('works for a Game count of 1 and of 30', () => {
    expect(endOf(standingsOf([1, 0]), 1, 1)).toMatchObject({ complete: true, tie: null })
    expect(endOf(standingsOf([0, 0]), 29, 30)).toMatchObject({ complete: false, tie: null })
    expect(endOf(standingsOf([0, 0]), 30, 30)).toMatchObject({ complete: true, tie: [1, 2] })
  })
})

describe('standingsAndEnd', () => {
  const settings = { pointsTable: { preset: 'linear' as const, values: [2, 1, 0] }, teamCount: 3, gameCount: 2 }

  it('sums the Places of every Round into the Standings and counts the Rounds as played', () => {
    const rounds = [[{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 3 }], [{ team: 2, place: 1 }, { team: 1, place: 2 }, { team: 3, place: 3 }]]

    expect(standingsAndEnd(rounds, settings)).toEqual({
      standings: standingsOf([3, 3, 0]),
      end: { played: 2, gameCount: 2, complete: true, tie: [1, 2] },
    })
  })

  it('has every Party at 0 points and nothing played before the first Result', () => {
    expect(standingsAndEnd([], settings)).toEqual({ standings: standingsOf([0, 0, 0]), end: { played: 0, gameCount: 2, complete: false, tie: null } })
  })
})

describe('outcomeOf', () => {
  it('is the winner without a Tie', () => {
    expect(outcomeOf({ tie: null })).toBe('winner')
  })

  it('is the tie with a Tie', () => {
    expect(outcomeOf({ tie: [1, 2] })).toBe('tie')
  })
})

describe('finishRejection', () => {
  const complete = { complete: true, tie: null }
  const incomplete = { complete: false, tie: null }
  const tied = { complete: true, tie: [1, 2] }
  const alone = standingsOf([3, 1, 0])
  const level = standingsOf([3, 3, 0])
  const ask = (input: Partial<Parameters<typeof finishRejection>[0]>) => finishRejection({ isHost: true, phase: 'running', end: complete, standings: alone, outcome: 'winner', winners: [1], ...input })

  it('refuses a Player first, before every other rule', () => {
    expect(ask({ isHost: false, phase: 'poll', end: incomplete })).toBe('not_host')
  })

  it('refuses the Host in every Phase but running with wrong_phase, even when incomplete', () => {
    for (const phase of ['draft', 'poll', 'date_set', 'finished', 'archived'] as const) {
      expect(ask({ phase, end: incomplete })).toBe('wrong_phase')
      expect(ask({ phase, end: complete })).toBe('wrong_phase')
    }
  })

  it('refuses a running Event whose Rounds with a Result do not reach the Game count with results_missing', () => {
    expect(ask({ end: incomplete })).toBe('results_missing')
  })

  it('allows a complete Event without a Tie when the Host asks for the winner he saw', () => {
    expect(ask({})).toBeNull()
  })

  it('refuses the winner for a Tie with standings_changed', () => {
    expect(ask({ end: tied, standings: level, winners: [1] })).toBe('standings_changed')
  })

  it('refuses the tie for a Event without a Tie with standings_changed', () => {
    expect(ask({ outcome: 'tie', winners: [1] })).toBe('standings_changed')
  })

  it('allows the tie for a Tie the Host saw', () => {
    expect(ask({ end: tied, standings: level, outcome: 'tie', winners: [1, 2] })).toBeNull()
  })

  it('refuses a winner other than the sole leader now, although the outcome is the same (review 0.8 S2)', () => {
    expect(ask({ standings: standingsOf([1, 3, 0]), winners: [1] })).toBe('standings_changed')
  })

  it('refuses a Tie whose Parties are not the Parties on Place 1 now, however many there are', () => {
    expect(ask({ end: tied, standings: standingsOf([3, 0, 3]), outcome: 'tie', winners: [1, 2] })).toBe('standings_changed')
    expect(ask({ end: tied, standings: level, outcome: 'tie', winners: [1] })).toBe('standings_changed')
    expect(ask({ end: tied, standings: level, outcome: 'tie', winners: [1, 2, 3] })).toBe('standings_changed')
  })

  it('compares the winners as a set: any order, a repeated Party counts once', () => {
    expect(ask({ end: tied, standings: level, outcome: 'tie', winners: [2, 1] })).toBeNull()
    expect(ask({ end: tied, standings: level, outcome: 'tie', winners: [2, 1, 2] })).toBeNull()
  })
})

describe('lastGameRejection', () => {
  const level = { complete: true, tie: [1, 2] }
  const sole = { complete: true, tie: null }
  const incomplete = { complete: false, tie: null }
  const everyone = Array.from({ length: 8 }, (_, index) => index + 1)

  it('refuses a Player first, before every other rule', () => {
    expect(lastGameRejection({ isHost: false, phase: 'running', end: incomplete, gameCount: GAME_COUNT_MAX })).toBe('not_host')
  })

  it('refuses the Host in every Phase but running with wrong_phase, even when incomplete or with a Tie', () => {
    for (const phase of ['draft', 'poll', 'date_set', 'finished', 'archived'] as const) {
      expect(lastGameRejection({ isHost: true, phase, end: incomplete, gameCount: 2 })).toBe('wrong_phase')
      expect(lastGameRejection({ isHost: true, phase, end: level, gameCount: 2 })).toBe('wrong_phase')
    }
  })

  it('refuses a running Event whose Rounds with a Result do not reach the Game count with results_missing, even with a Tie', () => {
    expect(lastGameRejection({ isHost: true, phase: 'running', end: incomplete, gameCount: 2 })).toBe('results_missing')
    expect(lastGameRejection({ isHost: true, phase: 'running', end: { complete: false, tie: [1, 2] }, gameCount: 2 })).toBe('results_missing')
  })

  it('refuses a complete Event without a Tie with no_tie, also at the maximum', () => {
    expect(lastGameRejection({ isHost: true, phase: 'running', end: sole, gameCount: 2 })).toBe('no_tie')
    expect(lastGameRejection({ isHost: true, phase: 'running', end: sole, gameCount: GAME_COUNT_MAX })).toBe('no_tie')
  })

  it('refuses a Tie at the Game count maximum with game_count_range, and allows one below it', () => {
    expect(lastGameRejection({ isHost: true, phase: 'running', end: level, gameCount: GAME_COUNT_MAX })).toBe('game_count_range')
    expect(lastGameRejection({ isHost: true, phase: 'running', end: level, gameCount: GAME_COUNT_MAX - 1 })).toBeNull()
  })

  it('allows the last game for a Tie at Game counts 1 and 2, and for a Tie of all eight Parties at count 4', () => {
    expect(lastGameRejection({ isHost: true, phase: 'running', end: level, gameCount: 1 })).toBeNull()
    expect(lastGameRejection({ isHost: true, phase: 'running', end: level, gameCount: 2 })).toBeNull()
    expect(lastGameRejection({ isHost: true, phase: 'running', end: { complete: true, tie: everyone }, gameCount: 4 })).toBeNull()
  })
})
