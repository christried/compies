import { describe, expect, it } from 'vitest'
import { SCORE_MAX, nextRoundNumber, normalizeScore, partyPoints, placesFromOrder, pointsForPlace, resultRejection, resultShapeValid, scoreValid, winnersOf, type ResultPlace } from '../../shared/results'
import { TEAM_COUNT_MAX, TEAM_COUNT_MIN } from '../../shared/settings'

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
    expect(resultRejection(input({ round: { ...open, resultAt: new Date('2090-11-07T20:00:00Z') }, places: null }))).toBe('round_not_open')
  })

  it('refuses missing Places and a bad shape as invalid_result', () => {
    expect(resultRejection(input({ places: null }))).toBe('invalid_result')
    expect(resultRejection(input({ places: [place(1, 1), place(2, 1), place(3, 2)] }))).toBe('invalid_result')
  })
})
