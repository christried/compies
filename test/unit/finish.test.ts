import { describe, expect, it } from 'vitest'
import { endOf, finishRejection, lastGameRejection, leadersOf, leadingTeams, outcomeOf, standingsAndEnd } from '../../shared/finish'
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

// The Leading Party (#38, GLOSSARY: Leading Party): the Parties on the first rank while the Event runs, the Winners once it is finished.
describe('leadingTeams', () => {
  it('is empty before the first Result, whatever the standings say', () => {
    expect(leadingTeams(standingsOf([0, 0, 0]), 'running', false)).toEqual([])
  })

  it('lists the one Party on rank 1 while the Event runs', () => {
    expect(leadingTeams(standingsOf([1, 3, 2]), 'running', true)).toEqual([2])
  })

  it('lists every Party that shares the first rank, in team order', () => {
    expect(leadingTeams(standingsOf([2, 0, 2]), 'running', true)).toEqual([1, 3])
  })

  it('lists all eight Parties when all are level on the first rank', () => {
    expect(leadingTeams(standingsOf([4, 4, 4, 4, 4, 4, 4, 4]), 'running', true)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('lists the Winners of a finished Event: one Party', () => {
    expect(leadingTeams(standingsOf([3, 1, 0]), 'finished', true)).toEqual([1])
  })

  it('lists the Parties of a Tie as the Winners of a finished Event', () => {
    expect(leadingTeams(standingsOf([1, 1, 0]), 'finished', true)).toEqual([1, 2])
  })

  it.each(['draft', 'poll', 'date_set', 'archived'] as const)('is empty in the %s Phase, with Results and standings', (phase) => {
    expect(leadingTeams(standingsOf([3, 1, 0]), phase, true)).toEqual([])
  })

  it('is empty in a finished Event without Results', () => {
    expect(leadingTeams(standingsOf([3, 1, 0]), 'finished', false)).toEqual([])
  })

  it('is empty without standings', () => {
    expect(leadingTeams([], 'running', true)).toEqual([])
  })
})

describe('endOf', () => {
  it('is not complete while fewer Rounds have a Result than the Game count, and a Tie needs completeness', () => {
    expect(endOf(standingsOf([1, 1, 0]), 2, 3, 1)).toEqual({ played: 2, gameCount: 3, complete: false, tie: null, decided: false })
  })

  it('is complete at the Game count with one leader, and has no Tie', () => {
    expect(endOf(standingsOf([2, 1, 0]), 2, 2, 1)).toEqual({ played: 2, gameCount: 2, complete: true, tie: null, decided: true })
  })

  it('names the two leaders as the Tie when complete and level on rank 1', () => {
    expect(endOf(standingsOf([1, 1, 0]), 2, 2, 1)).toEqual({ played: 2, gameCount: 2, complete: true, tie: [1, 2], decided: false })
  })

  it('names three of four level Parties on rank 1, in team order', () => {
    expect(endOf(standingsOf([3, 3, 0, 3]), 3, 3, 1).tie).toEqual([1, 2, 4])
  })

  it('names every Party of an all-level Event with eight Parties', () => {
    expect(endOf(standingsOf([2, 2, 2, 2, 2, 2, 2, 2]), 1, 1, 1).tie).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('counts a played number above the Game count as complete (defensive)', () => {
    expect(endOf(standingsOf([2, 0]), 3, 2, 1)).toMatchObject({ complete: true, tie: null })
  })

  it('works for a Game count of 1 and of 30', () => {
    expect(endOf(standingsOf([1, 0]), 1, 1, 1)).toMatchObject({ complete: true, tie: null })
    expect(endOf(standingsOf([0, 0]), 29, 30, 1)).toMatchObject({ complete: false, tie: null })
    expect(endOf(standingsOf([0, 0]), 30, 30, 1)).toMatchObject({ complete: true, tie: [1, 2] })
  })
})

describe('standingsAndEnd', () => {
  const settings = { pointsTable: { preset: 'linear' as const, values: [2, 1, 0] }, teamCount: 3, gameCount: 2 }

  it('sums the Places of every Round into the Standings and counts the Rounds as played', () => {
    const rounds = [[{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 3 }], [{ team: 2, place: 1 }, { team: 1, place: 2 }, { team: 3, place: 3 }]]

    expect(standingsAndEnd(rounds, settings)).toEqual({
      standings: standingsOf([3, 3, 0]),
      end: { played: 2, gameCount: 2, complete: true, tie: [1, 2], decided: false },
    })
  })

  it('has every Party at 0 points and nothing played before the first Result', () => {
    expect(standingsAndEnd([], settings)).toEqual({ standings: standingsOf([0, 0, 0]), end: { played: 0, gameCount: 2, complete: false, tie: null, decided: false } })
  })
})

// The early Finish (#953, GLOSSARY: Finish): decided once one Party leads alone and every other Party's gap to it is larger than the Rounds
// left × (points of Place 1 − points of the last Place). An equal gap still allows a Tie, so it is not decided.
describe('decided (#953)', () => {
  const linear3 = { pointsTable: { preset: 'linear' as const, values: [2, 1, 0] }, teamCount: 3 }
  /** `rounds` Results in which Party 1 wins and Party 2 is second, then the end of a Game count of `gameCount`. */
  const oneLeads = (rounds: number, gameCount: number, settings: { pointsTable: { preset: 'linear' | 'winner_takes_all' | 'custom', values: number[] }, teamCount: number } = linear3) =>
    standingsAndEnd(Array.from({ length: rounds }, () => [{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 3 }]), { ...settings, gameCount }).end

  it('is decided when the gap to the second is larger than the Rounds left × (Place 1 − last Place)', () => {
    // 4 Results: 8, 4, 0 points. Game count 5: 1 Round left × 2 = 2 < 4.
    expect(oneLeads(4, 5)).toMatchObject({ played: 4, gameCount: 5, complete: false, decided: true })
  })

  it('is not decided when the gap equals the limit: a Tie can still arise', () => {
    // 4 Results: gap 4. Game count 6: 2 Rounds left × 2 = 4.
    expect(oneLeads(4, 6)).toMatchObject({ complete: false, decided: false })
  })

  it('is not decided when the gap is below the limit', () => {
    expect(oneLeads(4, 7)).toMatchObject({ complete: false, decided: false })
  })

  it('reads the Points table set by hand: its first and its last Place, on both sides of the edge', () => {
    // A custom table 5, 3, 1: 2 Results give 10, 6, 2, a gap of 4; each Round left can close 5 − 1 = 4.
    const custom = { pointsTable: { preset: 'custom' as const, values: [5, 3, 1] }, teamCount: 3 }
    expect(oneLeads(2, 3, custom)).toMatchObject({ decided: false })
    expect(oneLeads(3, 4, custom)).toMatchObject({ decided: true })
  })

  it('reads the last Place of the Event\'s Party count, not of a longer table', () => {
    // Two Parties with a table 3, 1, 0: the last Place is 2 (1 point), so a Round closes 2. 2 Results: gap 4, 2 Rounds left × 2 = 4.
    const twoOfLonger = { pointsTable: { preset: 'custom' as const, values: [3, 1, 0] }, teamCount: 2 }
    const results = (n: number) => Array.from({ length: n }, () => [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    expect(standingsAndEnd(results(2), { ...twoOfLonger, gameCount: 4 }).end.decided).toBe(false)
    expect(standingsAndEnd(results(2), { ...twoOfLonger, gameCount: 3 }).end.decided).toBe(true)
  })

  it('looks at every other Party, not only the second', () => {
    // 6, 0, 3 after three Results: Party 2 is far behind, Party 3 only 3 points. Game count 4: 1 Round × 2 = 2 < 3; Game count 5: 4 > 3.
    const thirdClose = Array.from({ length: 3 }, () => [{ team: 1, place: 1 }, { team: 3, place: 2 }, { team: 2, place: 3 }])
    expect(standingsAndEnd(thirdClose, { ...linear3, gameCount: 4 }).end.decided).toBe(true)
    expect(standingsAndEnd(thirdClose, { ...linear3, gameCount: 5 }).end.decided).toBe(false)
  })

  it('is never decided while the first rank is shared, nor before the first Result', () => {
    const level = [[{ team: 1, place: 1 }, { team: 2, place: 1 }, { team: 3, place: 3 }]]
    expect(standingsAndEnd(level, { ...linear3, gameCount: 1 }).end).toMatchObject({ complete: true, decided: false })
    expect(standingsAndEnd([], { ...linear3, gameCount: 3 }).end.decided).toBe(false)
  })

  it('is decided at the Game count with one leader: no Round is left', () => {
    expect(oneLeads(2, 2)).toMatchObject({ complete: true, decided: true })
  })

  it('is never decided early under a table where every Place earns the same', () => {
    const flat = { pointsTable: { preset: 'custom' as const, values: [1, 1, 1] }, teamCount: 3 }
    expect(oneLeads(2, 5, flat).decided).toBe(false)
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
  const complete = { complete: true, tie: null, decided: true }
  const incomplete = { complete: false, tie: null, decided: false }
  const tied = { complete: true, tie: [1, 2], decided: false }
  /** Not complete, but one Party can no longer be caught (#953). */
  const decided = { complete: false, tie: null, decided: true }
  const alone = standingsOf([3, 1, 0])
  const level = standingsOf([3, 3, 0])
  const ask = (input: Partial<Parameters<typeof finishRejection>[0]>) => finishRejection({ isHost: true, phase: 'running', end: complete, waiting: false, standings: alone, outcome: 'winner', winners: [1], ...input })

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

  // The early Finish (#953): a decided Event finishes before the Game count, with its sole leader as the winner.
  it('allows a decided, incomplete Event for the sole leader the Host saw', () => {
    expect(ask({ end: decided })).toBeNull()
  })

  it('refuses a decided, incomplete Event while a Round waits for its Result with round_waiting', () => {
    expect(ask({ end: decided, waiting: true })).toBe('round_waiting')
  })

  it('checks results_missing before round_waiting: an undecided, incomplete Event with a waiting Round is results_missing', () => {
    expect(ask({ end: incomplete, waiting: true })).toBe('results_missing')
  })

  it('checks round_waiting after the Phase and the Host', () => {
    expect(ask({ end: decided, waiting: true, isHost: false })).toBe('not_host')
    expect(ask({ end: decided, waiting: true, phase: 'finished' })).toBe('wrong_phase')
  })

  it('refuses a decided Event for a winner other than the sole leader now, or for a Tie, with standings_changed', () => {
    expect(ask({ end: decided, standings: standingsOf([1, 3, 0]), winners: [1] })).toBe('standings_changed')
    expect(ask({ end: decided, outcome: 'tie', winners: [1] })).toBe('standings_changed')
  })

  it('leaves the complete case as it was: a waiting Round does not refuse it', () => {
    expect(ask({ waiting: true })).toBeNull()
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
