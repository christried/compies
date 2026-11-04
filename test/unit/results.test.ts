import { describe, expect, it } from 'vitest'
import { SCORE_MAX, endOf, finishRejection, lastGameRejection, leadersOf, nextRoundNumber, normalizeScore, outcomeOf, partyPoints, placesFromOrder, pointsForPlace, resultRejection, resultShapeValid, sameResult, scoreValid, standingsOf, totalPoints, winnersOf, type ResultPlace } from '../../shared/results'
import { GAME_COUNT_MAX, TEAM_COUNT_MAX, TEAM_COUNT_MIN } from '../../shared/settings'

// The rules of a Result (#273, spec #272, GLOSSARY: Result, Place, Shared place, Points table, Score): the shape of the Places, the
// Score's cap, the points a Place earns, the order the result sheet makes, the next Round number and the reason a Result cannot be
// entered now. Pure, so the client and the server agree at the limits.

const linear = { values: [3, 2, 1, 0] }
const winnerTakesAll = { values: [3, 0, 0, 0] }
const custom = { values: [10, 7, 3, 1] }
const place = (team: number, placeOf: number, score: string | null = null): ResultPlace => ({ team, place: placeOf, score })

describe('normalizeScore', () => {
  it('keeps a Score and trims it', () => {
    expect(normalizeScore('16')).toBe('16')
    expect(normalizeScore('  16:12 ')).toBe('16:12')
  })

  it('reads an empty Score as none', () => {
    expect(normalizeScore('')).toBeNull()
    expect(normalizeScore('   ')).toBeNull()
  })
})

describe('scoreValid', () => {
  it('accepts none, and a trimmed Score of 1 to SCORE_MAX characters', () => {
    expect(SCORE_MAX).toBe(7)
    expect(scoreValid(null)).toBe(true)
    expect(scoreValid('1234567')).toBe(true)
    expect(scoreValid('👨‍👩‍👧'.repeat(7))).toBe(true)
  })

  it('refuses a Score of 8 characters, an emoji family of 8, an untrimmed one and an empty one', () => {
    expect(scoreValid('12345678')).toBe(false)
    expect(scoreValid('👨‍👩‍👧'.repeat(8))).toBe(false)
    expect(scoreValid(' 1')).toBe(false)
    expect(scoreValid('')).toBe(false)
  })
})

describe('resultShapeValid', () => {
  const valid = (places: ResultPlace[], teamCount = 3) => resultShapeValid(places, teamCount)

  it('accepts a Result in which every Party has one Place, with or without Shared places', () => {
    expect(valid([place(1, 1), place(2, 2), place(3, 3)])).toBe(true)
    expect(valid([place(1, 1), place(2, 1), place(3, 3)])).toBe(true)
    expect(valid([place(1, 1), place(2, 2), place(3, 2)])).toBe(true)
    expect(valid([place(1, 1), place(2, 1), place(3, 1)])).toBe(true)
  })

  it('refuses a Place that skips a number, a Place that does not start at 1, and a Shared place that is not the one above', () => {
    expect(valid([place(1, 1), place(2, 1), place(3, 2)])).toBe(false)
    expect(valid([place(1, 2), place(2, 2), place(3, 3)])).toBe(false)
    expect(valid([place(1, 1), place(2, 3), place(3, 3)])).toBe(false)
  })

  it('refuses a Party missing, doubled, out of range or not a whole number, and a wrong count', () => {
    expect(valid([place(1, 1), place(2, 2), place(0, 3)])).toBe(false)
    expect(valid([place(1, 1), place(1, 2), place(3, 3)])).toBe(false)
    expect(valid([place(1, 1), place(2, 2), place(3, 3), place(4, 4)])).toBe(false)
    expect(valid([place(1, 1), place(2, 2)])).toBe(false)
    expect(valid([place(1, 1), place(2, 2), place(3, 3), place(3, 3)])).toBe(false)
    expect(valid([place(1, 1), place(2, 2), place(3.5, 3)])).toBe(false)
  })

  it('accepts the Places in any order of the array', () => {
    expect(valid([place(3, 3), place(1, 1), place(2, 2)])).toBe(true)
    expect(valid([place(2, 1), place(3, 1), place(1, 3)])).toBe(true)
  })

  it('refuses a Score that is too long, and accepts Scores of 0 and 7 characters', () => {
    expect(valid([place(1, 1, '12345678'), place(2, 2), place(3, 3)])).toBe(false)
    expect(valid([place(1, 1, '1234567'), place(2, 2, ''), place(3, 3, null)])).toBe(false)
    expect(valid([place(1, 1, '1234567'), place(2, 2, '1'), place(3, 3, null)])).toBe(true)
  })

  it('takes the team counts at their edges, 2 and 8', () => {
    expect(TEAM_COUNT_MIN).toBe(2)
    expect(TEAM_COUNT_MAX).toBe(8)
    expect(valid([place(1, 1), place(2, 2)], 2)).toBe(true)
    expect(valid([place(1, 1), place(2, 3)], 2)).toBe(false)
    expect(valid([place(1, 1), place(2, 1)], 2)).toBe(true)
    expect(valid([place(1, 1), place(2, 1), place(3, 3), place(4, 3), place(5, 5), place(6, 5), place(7, 7), place(8, 7)], 8)).toBe(true)
  })
})

describe('pointsForPlace and partyPoints', () => {
  it('gives the points of a Place from the table, and nothing beyond it', () => {
    expect(pointsForPlace(1, linear)).toBe(3)
    expect(pointsForPlace(4, linear)).toBe(0)
    expect(pointsForPlace(5, linear)).toBe(0)
    expect(pointsForPlace(2, custom)).toBe(7)
  })

  it('gives each Party the points of its Place, in team order, a Shared place earning the better Place', () => {
    expect(partyPoints([place(1, 1), place(2, 1), place(3, 3), place(4, 4)], linear)).toEqual([3, 3, 1, 0])
    expect(partyPoints([place(1, 1), place(2, 2), place(3, 3), place(4, 4)], winnerTakesAll)).toEqual([3, 0, 0, 0])
    expect(partyPoints([place(1, 1), place(2, 2), place(3, 3), place(4, 4)], custom)).toEqual([10, 7, 3, 1])
  })

  it('gives a Party a Place beyond the table no points', () => {
    expect(partyPoints([place(1, 1), place(2, 5)], custom)).toEqual([10, 0])
  })
})

describe('placesFromOrder', () => {
  it('numbers the rows by their position when no row is level', () => {
    expect(placesFromOrder([1, 2, 3], [false, false, false])).toEqual([{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 3 }])
  })

  it('gives a level row the Place of the row above, and the rows below follow', () => {
    expect(placesFromOrder([1, 2, 3], [false, true, false])).toEqual([{ team: 1, place: 1 }, { team: 2, place: 1 }, { team: 3, place: 3 }])
    expect(placesFromOrder([1, 2, 3], [false, false, true])).toEqual([{ team: 1, place: 1 }, { team: 2, place: 2 }, { team: 3, place: 2 }])
    expect(placesFromOrder([1, 2, 3], [false, true, true])).toEqual([{ team: 1, place: 1 }, { team: 2, place: 1 }, { team: 3, place: 1 }])
  })

  it('takes the order of the rows as they stand, and ignores the flag of the first row', () => {
    expect(placesFromOrder([3, 1, 2], [true, true, false])).toEqual([{ team: 3, place: 1 }, { team: 1, place: 1 }, { team: 2, place: 3 }])
  })
})

describe('winnersOf', () => {
  it('names the one team on Place 1', () => {
    expect(winnersOf([place(2, 1), place(1, 2), place(3, 3)])).toEqual([2])
  })

  it('names both teams of a Shared place on 1, ascending', () => {
    expect(winnersOf([place(3, 1), place(1, 3), place(2, 1)])).toEqual([2, 3])
  })

  it('names every team when all are level', () => {
    expect(winnersOf([place(1, 1), place(2, 1), place(3, 1)])).toEqual([1, 2, 3])
  })
})

describe('nextRoundNumber', () => {
  it('is 1 for no Round with a number', () => {
    expect(nextRoundNumber([])).toBe(1)
    expect(nextRoundNumber([null, null])).toBe(1)
  })

  it('is the highest number + 1, not the count', () => {
    expect(nextRoundNumber([1, 2, null])).toBe(3)
    expect(nextRoundNumber([3, null, 1])).toBe(4)
  })

  it('numbers the 30th Round of an Event, the most a Game count allows (GAME_COUNT_MAX)', () => {
    expect(nextRoundNumber(Array.from({ length: 29 }, (_, index) => index + 1))).toBe(30)
  })
})

// #275: a save that equals the stored Result is a no-op, so the rule is "the same Parties with the same Place and Score, in any order".
describe('sameResult', () => {
  it('is true for equal lists, also in another order', () => {
    const stored = [place(1, 1, '16'), place(2, 2), place(3, 3, '8')]
    expect(sameResult(stored, [place(1, 1, '16'), place(2, 2), place(3, 3, '8')])).toBe(true)
    expect(sameResult(stored, [place(3, 3, '8'), place(1, 1, '16'), place(2, 2)])).toBe(true)
  })

  it('is false for a different Place, a different Score, a Score removed or added, a missing Party and a different length', () => {
    const stored = [place(1, 1, '16'), place(2, 2), place(3, 3)]
    expect(sameResult(stored, [place(2, 1, '16'), place(1, 2), place(3, 3)])).toBe(false)
    expect(sameResult(stored, [place(1, 1, '17'), place(2, 2), place(3, 3)])).toBe(false)
    expect(sameResult(stored, [place(1, 1), place(2, 2), place(3, 3)])).toBe(false)
    expect(sameResult([place(1, 1), place(2, 2)], [place(1, 1), place(2, 2, '1')])).toBe(false)
    expect(sameResult(stored, [place(1, 1, '16'), place(2, 2)])).toBe(false)
    expect(sameResult(stored, [place(1, 1, '16'), place(2, 2), place(3, 3), place(4, 4)])).toBe(false)
  })

  it('tells a Score from none, and two nones alike', () => {
    expect(sameResult([place(1, 1, '16')], [place(1, 1, null)])).toBe(false)
    expect(sameResult([place(1, 1, null)], [place(1, 1, null)])).toBe(true)
  })

  it('is true for two empty lists', () => {
    expect(sameResult([], [])).toBe(true)
  })

  it('keeps a Shared place: 1,1,3 is not 1,2,3', () => {
    expect(sameResult([place(1, 1), place(2, 1), place(3, 3)], [place(1, 1), place(2, 2), place(3, 3)])).toBe(false)
    expect(sameResult([place(1, 1), place(2, 1), place(3, 3)], [place(2, 1), place(1, 1), place(3, 3)])).toBe(true)
  })
})

describe('resultRejection', () => {
  const settings = { teamCount: 3 }
  const open = { setAt: new Date('2090-11-07T19:00:00Z'), putBackAt: null, resultAt: null }
  const good = [place(1, 1), place(2, 2), place(3, 3)]
  const input = (fields: Partial<Parameters<typeof resultRejection>[0]> = {}) => ({ isHost: true, settings, phase: 'running' as const, round: open, places: good, ...fields }) as Parameters<typeof resultRejection>[0]

  it('is null for a valid Result on an open Round', () => {
    expect(resultRejection(input())).toBeNull()
  })

  it('refuses a non-Host first, before the body or the Round', () => {
    expect(resultRejection(input({ isHost: false, round: null, places: null }))).toBe('not_host')
  })

  it('refuses an Event that is not set up before a wrong Phase', () => {
    expect(resultRejection(input({ settings: null, phase: 'finished' }))).toBe('not_set_up')
  })

  it('refuses every Phase but running, before an unknown Round', () => {
    for (const phase of ['poll', 'date_set', 'finished', 'archived', 'draft'] as const) {
      expect(resultRejection(input({ phase, round: null })), phase).toBe('wrong_phase')
    }
  })

  it('refuses an unknown Round before an invalid body', () => {
    expect(resultRejection(input({ round: null, places: null }))).toBe('round_not_found')
  })

  it('refuses a Round that is not open before an invalid body, for each reason', () => {
    expect(resultRejection(input({ round: { ...open, setAt: null }, places: null }))).toBe('round_not_open')
    expect(resultRejection(input({ round: { ...open, putBackAt: new Date('2090-11-07T20:00:00Z') }, places: null }))).toBe('round_not_open')
  })

  // #275: a Round with a Result is corrected, so it is not refused as not open; its body is checked like any Result.
  it('accepts a valid body for a Round with a Result as a Correction', () => {
    const corrected = { ...open, resultAt: new Date('2090-11-07T20:00:00Z') }
    expect(resultRejection(input({ round: corrected }))).toBeNull()
    expect(resultRejection(input({ round: corrected, places: [place(1, 1), place(2, 1), place(3, 3)] }))).toBeNull()
  })

  it('refuses a Correction with missing Places or a bad shape as invalid_result', () => {
    const corrected = { ...open, resultAt: new Date('2090-11-07T20:00:00Z') }
    expect(resultRejection(input({ round: corrected, places: null }))).toBe('invalid_result')
    expect(resultRejection(input({ round: corrected, places: [place(1, 1), place(2, 1), place(3, 2)] }))).toBe('invalid_result')
  })

  it('refuses a Correction by a non-Host, in a finished Event, and on a Round with a Result that is not set up as its own reason', () => {
    const corrected = { ...open, resultAt: new Date('2090-11-07T20:00:00Z') }
    expect(resultRejection(input({ round: corrected, isHost: false }))).toBe('not_host')
    expect(resultRejection(input({ round: corrected, phase: 'finished' }))).toBe('wrong_phase')
    expect(resultRejection(input({ round: corrected, settings: null }))).toBe('not_set_up')
  })

  it('still refuses a Round being drawn or put back, with or without a Result', () => {
    expect(resultRejection(input({ round: { ...open, setAt: null }, places: good }))).toBe('round_not_open')
    expect(resultRejection(input({ round: { ...open, putBackAt: new Date('2090-11-07T20:00:00Z') }, places: good }))).toBe('round_not_open')
    const corrected = { ...open, resultAt: new Date('2090-11-07T20:00:00Z') }
    expect(resultRejection(input({ round: { ...corrected, putBackAt: new Date('2090-11-07T21:00:00Z') }, places: good }))).toBe('round_not_open')
  })

  it('refuses missing Places and a bad shape as invalid_result', () => {
    expect(resultRejection(input({ places: null }))).toBe('invalid_result')
    expect(resultRejection(input({ places: [place(1, 1), place(2, 1), place(3, 2)] }))).toBe('invalid_result')
  })
})

// The Standings (#274, GLOSSARY: Standings): every Party's points over all Results, and the rank that goes with them. Pure, so the
// page and the server show the same ranks; `standingsOf` is the one place the rank rule lives.
describe('totalPoints', () => {
  const linear3 = { values: [2, 1, 0] }

  it('gives every Party zero when there is no Result, one entry per team', () => {
    expect(totalPoints([], linear3, 3)).toEqual([0, 0, 0])
    expect(totalPoints([], linear3, 2)).toEqual([0, 0])
  })

  it('adds the points of every Result to the Party that earned them', () => {
    const first = [place(1, 1), place(2, 2), place(3, 3)]
    const second = [place(3, 1), place(1, 2), place(2, 3)]
    expect(totalPoints([first, second], linear3, 3)).toEqual([2 + 1, 1 + 0, 0 + 2])
  })

  it('gives every Party of a Shared place the points of the better Place', () => {
    expect(totalPoints([[place(1, 1), place(2, 1), place(3, 3)]], linear3, 3)).toEqual([2, 2, 0])
  })

  it('counts a winner-takes-all table and a custom table', () => {
    expect(totalPoints([[place(1, 1), place(2, 2), place(3, 3)]], winnerTakesAll, 3)).toEqual([3, 0, 0])
    expect(totalPoints([[place(1, 1), place(2, 2), place(3, 3)]], custom, 3)).toEqual([10, 7, 3])
  })

  it('counts a Place beyond the table as nothing', () => {
    expect(totalPoints([[place(1, 1), place(2, 5)]], custom, 2)).toEqual([10, 0])
  })

  it('ignores a team beyond teamCount', () => {
    expect(totalPoints([[place(1, 1), place(2, 2), place(3, 3)]], linear3, 2)).toEqual([2, 1])
  })

  it('takes the team counts at their edges, 2 and 8', () => {
    expect(totalPoints([[place(1, 1), place(2, 2)]], { values: [1, 0] }, 2)).toEqual([1, 0])
    const eight = Array.from({ length: 8 }, (_, index) => place(index + 1, index + 1))
    expect(totalPoints([eight], { values: [8, 7, 6, 5, 4, 3, 2, 1] }, 8)).toEqual([8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('sums 30 Results without losing one', () => {
    const results = Array.from({ length: 30 }, () => [place(1, 1), place(2, 2), place(3, 3)])
    expect(totalPoints(results, linear3, 3)).toEqual([60, 30, 0])
  })
})

describe('standingsOf', () => {
  const row = (team: number, rank: number, points: number) => ({ team, rank, points })

  it('ranks Parties with different points 1, 2, 3 in that order', () => {
    expect(standingsOf([3, 2, 1])).toEqual([row(1, 1, 3), row(2, 2, 2), row(3, 3, 1)])
  })

  it('shares a rank for equal points, in team order, and skips the next rank', () => {
    expect(standingsOf([2, 2, 1])).toEqual([row(1, 1, 2), row(2, 1, 2), row(3, 3, 1)])
  })

  it('gives everybody rank 1, in team order, when all points are zero', () => {
    expect(standingsOf([0, 0, 0, 0])).toEqual([row(1, 1, 0), row(2, 1, 0), row(3, 1, 0), row(4, 1, 0)])
  })

  it('sorts the rows by points, then team, and ranks each by the Parties with more points', () => {
    expect(standingsOf([1, 3, 3, 0])).toEqual([row(2, 1, 3), row(3, 1, 3), row(1, 3, 1), row(4, 4, 0)])
  })

  it('handles two Parties', () => {
    expect(standingsOf([0, 1])).toEqual([row(2, 1, 1), row(1, 2, 0)])
    expect(standingsOf([1, 1])).toEqual([row(1, 1, 1), row(2, 1, 1)])
  })

  it('gives eight Parties that are all equal rank 1 in team order', () => {
    expect(standingsOf([4, 4, 4, 4, 4, 4, 4, 4])).toEqual(Array.from({ length: 8 }, (_, index) => row(index + 1, 1, 4)))
  })

  it('sorts points that arrive out of team order', () => {
    expect(standingsOf([1, 5, 3])).toEqual([row(2, 1, 5), row(3, 2, 3), row(1, 3, 1)])
  })

  it('skips the rank after a shared rank (1, 1, 3, never 1, 1, 2)', () => {
    const ranks = standingsOf([5, 5, 2, 0]).map(entry => entry.rank)
    expect(ranks).toEqual([1, 1, 3, 4])
  })

  it('does not change the points it is given', () => {
    const points = [1, 3, 2]
    standingsOf(points)
    expect(points).toEqual([1, 3, 2])
  })

  it('gives every Party the points of Place 1 in one level Result, and everybody rank 1', () => {
    const points = totalPoints([[place(1, 1), place(2, 1), place(3, 1)]], { values: [2, 1, 0] }, 3)
    expect(points).toEqual([2, 2, 2])
    expect(standingsOf(points).map(entry => entry.rank)).toEqual([1, 1, 1])
  })

  it('gives all zero for a Points table whose values are all 0, and everybody rank 1', () => {
    const points = totalPoints([[place(1, 1), place(2, 2)]], { values: [0, 0] }, 2)
    expect(points).toEqual([0, 0])
    expect(standingsOf(points)).toEqual([{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }])
  })
})

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

  it('refuses a Player first, before every other rule', () => {
    expect(finishRejection({ isHost: false, phase: 'poll', end: incomplete, outcome: 'winner' })).toBe('not_host')
  })

  it('refuses the Host in every Phase but running with wrong_phase, even when incomplete', () => {
    for (const phase of ['draft', 'poll', 'date_set', 'finished', 'archived'] as const) {
      expect(finishRejection({ isHost: true, phase, end: incomplete, outcome: 'winner' })).toBe('wrong_phase')
      expect(finishRejection({ isHost: true, phase, end: complete, outcome: 'winner' })).toBe('wrong_phase')
    }
  })

  it('refuses a running Event whose Rounds with a Result do not reach the Game count with results_missing', () => {
    expect(finishRejection({ isHost: true, phase: 'running', end: incomplete, outcome: 'winner' })).toBe('results_missing')
  })

  it('allows a complete Event without a Tie when the Host asks for the winner', () => {
    expect(finishRejection({ isHost: true, phase: 'running', end: complete, outcome: 'winner' })).toBeNull()
  })

  it('refuses the winner for a Tie with standings_changed', () => {
    expect(finishRejection({ isHost: true, phase: 'running', end: tied, outcome: 'winner' })).toBe('standings_changed')
  })

  it('refuses the tie for a Event without a Tie with standings_changed', () => {
    expect(finishRejection({ isHost: true, phase: 'running', end: complete, outcome: 'tie' })).toBe('standings_changed')
  })

  it('allows the tie for a Tie the Host saw', () => {
    expect(finishRejection({ isHost: true, phase: 'running', end: tied, outcome: 'tie' })).toBeNull()
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
