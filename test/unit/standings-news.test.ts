import { describe, expect, it } from 'vitest'
import { freshResult, marksOf, pointsDelta, rankMoves } from '../../app/utils/standings-news'
import type { ResultView, StandingView } from '../../shared/stage'

// What is new on the Standings page (#276, spec #272): which Result the page has not seen yet, and how the Standings moved. Pure, so the
// rules hold without Vue. The page keeps the marks it last read (`marksOf`); a Result is fresh by its entry or by a later Correction.

const game = { id: 'g', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] } as ResultView['game']
/** The instant of minute `minute` of one day, ISO UTC (ADR 0003). */
const at = (minute: number) => new Date(Date.UTC(2090, 10, 1, 10, minute)).toISOString()
const result = (number: number, fields: Partial<ResultView> = {}): ResultView => ({
  roundId: `r${number}`,
  number,
  game,
  places: [{ team: 1, place: 1, points: 2, score: null }, { team: 2, place: 2, points: 1, score: null }],
  corrected: false,
  correctedAt: null,
  resultAt: at(number),
  ...fields,
})
const standing = (team: number, rank: number, points: number): StandingView => ({ team, rank, points })
const seenOf = (results: readonly ResultView[]) => new Map(marksOf(results))

describe('marksOf', () => {
  it('marks a Result by its Correction when it has one, and by its entry when it has none', () => {
    const marks = marksOf([result(1), result(2, { corrected: true, correctedAt: at(9) })])

    expect([...marks]).toEqual([['r1', at(1)], ['r2', at(9)]])
  })

  it('maps no Results to nothing and 30 Results to 30 marks', () => {
    expect(marksOf([]).size).toBe(0)
    expect(marksOf(Array.from({ length: 30 }, (_, index) => result(index + 1))).size).toBe(30)
  })
})

describe('freshResult', () => {
  it('is null when the page has seen every Result', () => {
    const results = [result(1), result(2, { corrected: true, correctedAt: at(9) })]

    expect(freshResult(seenOf(results), results)).toBeNull()
  })

  it('is null for no Results at all', () => {
    expect(freshResult(new Map(), [])).toBeNull()
  })

  it('names a Result the page has not seen as entered', () => {
    const results = [result(1), result(2)]

    expect(freshResult(new Map([['r1', at(1)]]), results)).toEqual({ result: results[1], kind: 'entered' })
  })

  it('names a Result whose Correction is later than the mark the page saw as corrected', () => {
    const corrected = result(1, { corrected: true, correctedAt: at(5) })

    expect(freshResult(new Map([['r1', at(1)]]), [corrected])).toEqual({ result: corrected, kind: 'corrected' })
  })

  it('names a second Correction of the same Round as corrected again', () => {
    const again = result(1, { corrected: true, correctedAt: at(8) })

    expect(freshResult(new Map([['r1', at(5)]]), [again])).toEqual({ result: again, kind: 'corrected' })
  })

  it('names a Round the page missed with a Correction as entered, since the page saw neither', () => {
    const missed = result(1, { corrected: true, correctedAt: at(5) })

    expect(freshResult(new Map(), [missed])).toEqual({ result: missed, kind: 'entered' })
  })

  it('takes the newest of two fresh Results by their marks, not by their numbers', () => {
    const early = result(1, { resultAt: at(3) })
    const late = result(2, { resultAt: at(7) })
    const middle = result(3, { resultAt: at(5) })

    expect(freshResult(new Map(), [early, late, middle])).toEqual({ result: late, kind: 'entered' })
  })

  it('takes the higher number when two fresh Results carry the same mark', () => {
    const first = result(1, { resultAt: at(4) })
    const second = result(2, { resultAt: at(4) })

    expect(freshResult(new Map(), [first, second])).toEqual({ result: second, kind: 'entered' })
  })

  it('does not name a Result whose mark is equal to the one the page saw, or earlier (a clock that goes back)', () => {
    expect(freshResult(new Map([['r1', at(5)]]), [result(1, { resultAt: at(5) })])).toBeNull()
    expect(freshResult(new Map([['r1', at(5)]]), [result(1, { corrected: true, correctedAt: at(3) })])).toBeNull()
  })

  it('finds the one fresh Result among 30', () => {
    const results = Array.from({ length: 30 }, (_, index) => result(index + 1))
    const seen = seenOf(results.filter(entry => entry.number !== 17))

    expect(freshResult(seen, results)).toEqual({ result: results[16], kind: 'entered' })
  })
})

describe('rankMoves', () => {
  it('is empty when no rank changed', () => {
    expect(rankMoves([standing(1, 1, 2), standing(2, 2, 1)], [standing(1, 1, 3), standing(2, 2, 2)])).toEqual([])
  })

  it('is empty when every Party is level before and after', () => {
    expect(rankMoves([standing(1, 1, 0), standing(2, 1, 0)], [standing(1, 1, 2), standing(2, 1, 2)])).toEqual([])
  })

  it('names both Parties of a swap, in the order of the new Standings', () => {
    const before = [standing(1, 1, 2), standing(2, 2, 1)]
    const after = [standing(2, 1, 3), standing(1, 2, 2)]

    expect(rankMoves(before, after)).toEqual([{ team: 2, from: 2, to: 1 }, { team: 1, from: 1, to: 2 }])
  })

  it('names only the Party whose rank changed when a Shared rank splits (1, 1, 3 to 1, 2, 3)', () => {
    const before = [standing(1, 1, 3), standing(2, 1, 3), standing(3, 3, 0)]
    const after = [standing(1, 1, 4), standing(2, 2, 3), standing(3, 3, 0)]

    expect(rankMoves(before, after)).toEqual([{ team: 2, from: 1, to: 2 }])
  })

  it('leaves out a Party that is missing from before', () => {
    expect(rankMoves([standing(1, 1, 0)], [standing(1, 2, 0), standing(2, 1, 0)])).toEqual([{ team: 1, from: 1, to: 2 }])
  })

  it('names every one of eight Parties that move up by one, the first one falling to the last rank', () => {
    const before = Array.from({ length: 8 }, (_, index) => standing(index + 1, index + 1, 8 - index))
    const after = [...before.slice(1), before[0]!].map((entry, index) => ({ ...entry, rank: index + 1 }))

    expect(rankMoves(before, after)).toEqual([
      ...Array.from({ length: 7 }, (_, index) => ({ team: index + 2, from: index + 2, to: index + 1 })),
      { team: 1, from: 1, to: 8 },
    ])
  })
})

describe('pointsDelta', () => {
  it('gives the points each Party gained', () => {
    expect(pointsDelta([standing(1, 1, 2), standing(2, 2, 1)], [standing(1, 1, 5), standing(2, 2, 1)])).toEqual(new Map([[1, 3], [2, 0]]))
  })

  it('gives a negative delta for a Correction that takes points away', () => {
    expect(pointsDelta([standing(1, 1, 3), standing(2, 2, 1)], [standing(1, 2, 1), standing(2, 1, 2)])).toEqual(new Map([[1, -2], [2, 1]]))
  })

  it('counts a Party that is missing from before from 0', () => {
    expect(pointsDelta([standing(1, 1, 0)], [standing(1, 1, 2), standing(2, 2, 1)])).toEqual(new Map([[1, 2], [2, 1]]))
  })
})
