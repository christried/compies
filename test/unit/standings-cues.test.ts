import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { standingsChangeCues } from '../../app/dev/listening-model'
import { COUNT_TICK_MS, countAt, countTicks } from '../../app/utils/count-up'
import { STAMP_DELAY_MS } from '../../app/utils/motion'
import { CUE_IDS, CUE_GROUPS, claimCues, cueFilesOf, standingsCues, type ArrivalCue, type CueId, type StandingsCueInput } from '../../app/utils/sound-cues'
import type { StandingView } from '../../shared/stage'

// The Standings' sounds (#741, spec #718): which cue is due how long after the sequence starts, from ranks, points and team positions only.
// The Leaderboard decides whether a news plays at all (fresh, visible, not finished); these cues are what a played one sounds like.

const standing = (team: number, rank: number, points: number): StandingView => ({ team, rank, points })
const COUNT_MS = 600

/** Team 2 takes the lead with +3, team 1 drops to rank 2 (no gain). */
const BEFORE = [standing(1, 1, 12), standing(2, 2, 9), standing(3, 3, 0)]
const AFTER = [standing(2, 1, 12), standing(1, 2, 12), standing(3, 3, 0)]

const input = (fields: Partial<StandingsCueInput> = {}): StandingsCueInput => ({
  before: BEFORE, after: AFTER, winners: [2], celebrate: true, reducedMotion: false, countMs: COUNT_MS, stampDelayMs: STAMP_DELAY_MS, ...fields,
})
const idsOf = (cues: readonly ArrivalCue[]) => cues.map(cue => cue.id)
const delaysOf = (cues: readonly ArrivalCue[], id: CueId) => cues.filter(cue => cue.id === id).map(cue => cue.delayMs)

describe('countTicks', () => {
  const close = (actual: number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length)
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 0))
  }

  it('gives a gain of 3 three ticks, where the counter\'s displayed number changes', () => {
    close(countTicks(0, 3, COUNT_MS), [67, 200, 400])
  })

  it('gives a gain of 30 eight ticks, on the grid of the counter\'s writes and never more than nine', () => {
    const ticks = countTicks(0, 30, COUNT_MS)

    close(ticks, [67, 133, 200, 267, 333, 400, 467, 533])
    expect(ticks.length).toBeLessThanOrEqual(9)
  })

  it('has a tick exactly where the counter shows another number than before', () => {
    const ticks = countTicks(0, 30, COUNT_MS)
    let shown = 0
    for (let at = COUNT_TICK_MS; at < COUNT_MS; at += COUNT_TICK_MS) {
      const value = countAt(0, 30, at, COUNT_MS)
      expect(ticks.some(tick => Math.abs(tick - at) < 1e-6), `${at}`).toBe(value !== shown)
      shown = value
    }
  })

  it('gives nothing for a count that goes nowhere', () => {
    expect(countTicks(5, 5, COUNT_MS)).toEqual([])
    expect(countTicks(0, 0, COUNT_MS)).toEqual([])
  })

  it('gives nothing for a count with no duration (the number is there at once)', () => {
    expect(countTicks(0, 3, 0)).toEqual([])
  })

  it('ticks for a decrease too (a Correction that lowers points)', () => {
    const ticks = countTicks(6, 3, COUNT_MS)

    expect(ticks).toHaveLength(3)
  })

  it('keeps every two ticks the counter\'s write step apart, so no second holds more than 15, and ends within the duration', () => {
    for (const [from, to] of [[0, 1], [0, 2], [0, 3], [4, 9], [0, 30], [10, 99], [99, 0]] as const) {
      const ticks = countTicks(from, to, COUNT_MS)
      expect(ticks, `${from}→${to}`).toEqual([...ticks].sort((a, b) => a - b))
      ticks.slice(1).forEach((tick, index) => expect(tick - ticks[index]!, `${from}→${to}`).toBeGreaterThanOrEqual(COUNT_TICK_MS - 1e-6))
      expect(ticks.at(-1) ?? 0).toBeLessThanOrEqual(COUNT_MS)
      expect(ticks.length).toBeLessThanOrEqual(15)
    }
  })

  it('ends on the duration when the grid\'s last write did not reach the target yet', () => {
    // Over a duration that is not a multiple of the step the last number lands with the final write.
    const ticks = countTicks(0, 1, 100)

    expect(ticks.at(-1)).toBeLessThanOrEqual(100)
    expect(ticks.length).toBeGreaterThan(0)
  })
})

describe('standingsCues', () => {
  it('plays the swap at the start, the ticks of the Party that gained, and the winner with the stamp', () => {
    const cues = standingsCues(input())

    expect(cues[0]).toEqual({ id: 'lb-swap', delayMs: 0 })
    expect(delaysOf(cues, 'lb-count')).toHaveLength(countTicks(9, 12, COUNT_MS).length)
    expect(delaysOf(cues, 'lb-winner')).toEqual([STAMP_DELAY_MS])
  })

  it('is ascending by delay', () => {
    const delays = standingsCues(input()).map(cue => cue.delayMs)

    expect(delays).toEqual([...delays].sort((a, b) => a - b))
  })

  it('has no swap when no rank moved', () => {
    const cues = standingsCues(input({ before: [standing(1, 1, 3), standing(2, 2, 1)], after: [standing(1, 1, 6), standing(2, 2, 1)], winners: [1] }))

    expect(idsOf(cues)).not.toContain('lb-swap')
    expect(idsOf(cues)).toContain('lb-count')
  })

  it('has no swap with a single Party, and none for a Party that was not there before', () => {
    expect(idsOf(standingsCues(input({ before: [standing(1, 1, 0)], after: [standing(1, 1, 3)], winners: [1] })))).not.toContain('lb-swap')
    expect(idsOf(standingsCues(input({ before: [standing(1, 1, 3)], after: [standing(1, 1, 3), standing(2, 2, 3)], winners: [] })))).not.toContain('lb-swap')
  })

  it('swaps on the first Result: every Party was at 0 on rank 1 and the winner takes the lead', () => {
    const cues = standingsCues(input({ before: [standing(1, 1, 0), standing(2, 1, 0)], after: [standing(2, 1, 3), standing(1, 2, 0)], winners: [2] }))

    expect(idsOf(cues)).toContain('lb-swap')
    expect(delaysOf(cues, 'lb-count')).toHaveLength(3)
  })

  it('leaves out the ticks under reduced motion, keeps the swap, and plays the winner with the stamp at once (it has no delay then)', () => {
    const cues = standingsCues(input({ reducedMotion: true }))

    expect(cues).toEqual([{ id: 'lb-swap', delayMs: 0 }, { id: 'lb-winner', delayMs: 0 }])
  })

  it('plays the winner only where the stamp is drawn, and only with a winner', () => {
    expect(idsOf(standingsCues(input({ celebrate: false })))).not.toContain('lb-winner')
    expect(idsOf(standingsCues(input({ winners: [] })))).not.toContain('lb-winner')
    expect(idsOf(standingsCues(input({ celebrate: false })))).toContain('lb-swap')
  })

  it('takes the winner\'s delay from the input, not from a number of its own', () => {
    expect(delaysOf(standingsCues(input({ stampDelayMs: 123 })), 'lb-winner')).toEqual([123])
  })

  it('follows the Party whose points change most, up or down: 30 and 3 give the ticks of 30, not of both', () => {
    const cues = standingsCues(input({
      before: [standing(1, 1, 10), standing(2, 2, 5), standing(3, 3, 0)],
      after: [standing(3, 1, 30), standing(1, 2, 13), standing(2, 3, 5)],
    }))

    expect(delaysOf(cues, 'lb-count')).toEqual(countTicks(0, 30, COUNT_MS))
    expect(delaysOf(cues, 'lb-count')).toHaveLength(8)
  })

  it('reads the largest change by its size: a Correction that lowers points counts as a change too', () => {
    const cues = standingsCues(input({
      before: [standing(1, 1, 12), standing(2, 2, 5)],
      after: [standing(2, 1, 6), standing(1, 2, 3)],
      winners: [2],
    }))

    // Team 1 lost 9, team 2 gained 1: the ticks count Team 1 down from 12 to 3.
    expect(delaysOf(cues, 'lb-count')).toEqual(countTicks(12, 3, COUNT_MS))
  })

  it('takes one Party on a tie of the changes (the first of the new order): one set of ticks, not two', () => {
    const tie = standingsCues(input({
      before: [standing(1, 1, 0), standing(2, 1, 0)],
      after: [standing(2, 1, 3), standing(1, 1, 3)],
      winners: [2],
    }))

    expect(delaysOf(tie, 'lb-count')).toEqual(countTicks(0, 3, COUNT_MS))
  })

  it('has no ticks when nothing changed in the points', () => {
    const cues = standingsCues(input({ before: AFTER, after: AFTER, winners: [] }))

    expect(idsOf(cues)).not.toContain('lb-count')
  })

  it('counts a Party that is missing from `before` from 0', () => {
    const cues = standingsCues(input({ before: [standing(1, 1, 3)], after: [standing(2, 1, 6), standing(1, 2, 3)], winners: [2] }))

    expect(delaysOf(cues, 'lb-count')).toEqual(countTicks(0, 6, COUNT_MS))
  })

  it('has no cue at all for no Party and none for an empty change', () => {
    expect(standingsCues(input({ before: [], after: [], winners: [] }))).toEqual([])
    expect(standingsCues(input({ before: [], after: [standing(1, 1, 0)], winners: [], celebrate: false }))).toEqual([])
  })

  it('holds no tick for a leader with 0 points', () => {
    const cues = standingsCues(input({ before: [standing(1, 1, 0), standing(2, 1, 0)], after: [standing(1, 1, 0), standing(2, 1, 0)], winners: [] }))

    expect(cues).toEqual([])
  })

  it('works for eight Parties', () => {
    const before = Array.from({ length: 8 }, (_, index) => standing(index + 1, index + 1, 8 - index))
    const after = [standing(8, 1, 12), ...before.slice(0, 7).map((row, index) => standing(row.team, index + 2, row.points))]

    const cues = standingsCues(input({ before, after, winners: [8] }))

    expect(idsOf(cues)).toContain('lb-swap')
    expect(delaysOf(cues, 'lb-count')).toEqual(countTicks(1, 12, COUNT_MS))
  })
})

describe('the input of the Standings\' cues (Secrecy)', () => {
  // The type holds ranks, points, team positions and the setting, no game, label, name, score or Result; the rows go in through a cast, as a read's would.
  it('gives the same cues whatever else a standing row carries', () => {
    const plain = standingsCues(input())
    const loaded = standingsCues(input({
      before: BEFORE.map(row => ({ ...row, game: 'Kart', score: 41 }) as StandingView),
      after: AFTER.map(row => ({ ...row, game: 'Halo', score: 7 }) as StandingView),
    }))

    expect(loaded).toEqual(plain)
  })
})

describe('claimCues', () => {
  it('gives every cue the first time and claims each id once, for all of its ticks', () => {
    const asked = new Set<CueId>()
    const cues = standingsCues(input())

    expect(claimCues(asked, cues)).toEqual(cues)
    expect([...asked].sort()).toEqual(['lb-count', 'lb-swap', 'lb-winner'])
  })

  it('gives nothing again for the ids that are claimed, and the rest (the winner after the swap and the ticks)', () => {
    const asked = new Set<CueId>()
    const withoutWinner = standingsCues(input({ celebrate: false }))
    const withWinner = standingsCues(input())

    claimCues(asked, withoutWinner)

    expect(claimCues(asked, withWinner)).toEqual([{ id: 'lb-winner', delayMs: STAMP_DELAY_MS }])
    expect(claimCues(asked, withWinner)).toEqual([])
  })

  it('is one claim per news: another Set asks again', () => {
    const cues = standingsCues(input())
    claimCues(new Set(), cues)

    expect(claimCues(new Set(), cues)).toEqual(cues)
  })
})

// The group's rule is a row of the table in sound-cues.test.ts.
describe('the Standings\' group', () => {
  it('holds the three cues, in the order of CUE_IDS', () => {
    expect(cueFilesOf(['standings'])).toEqual(['lb-swap', 'lb-count', 'lb-winner'])
    for (const id of ['lb-swap', 'lb-count', 'lb-winner'] as const) {
      expect(CUE_IDS).toContain(id)
      expect(CUE_GROUPS[id]).toEqual(['standings'])
    }
  })
})

describe('the listening page\'s Standings change', () => {
  it('is the real function on a fixed change: the swap, the ticks of the gaining Party and the winner', () => {
    const cues = standingsChangeCues(false, COUNT_MS)

    expect(cues).toEqual(standingsCues({
      before: [standing(1, 1, 12), standing(2, 2, 9), standing(3, 3, 0)],
      after: [standing(2, 1, 15), standing(1, 2, 12), standing(3, 3, 0)],
      winners: [2],
      celebrate: true,
      reducedMotion: false,
      countMs: COUNT_MS,
      stampDelayMs: STAMP_DELAY_MS,
    }))
    expect(new Set(idsOf(cues))).toEqual(new Set(['lb-swap', 'lb-count', 'lb-winner']))
  })

  it('honours the page\'s reduced switch: no ticks', () => {
    expect(idsOf(standingsChangeCues(true, COUNT_MS))).toEqual(['lb-swap', 'lb-winner'])
  })
})

describe('the recipes of the Standings\' cues', () => {
  it('are a file of their own, scripts/cue-recipes/standings.mjs, with four recipes for each of the three ids', async () => {
    const file = resolve(import.meta.dirname, '../../scripts/cue-recipes/standings.mjs')
    expect(existsSync(file)).toBe(true)

    const recipes = (await import(file)).default as Record<string, { name: string }[]>

    expect(Object.keys(recipes).sort()).toEqual(['lb-count', 'lb-swap', 'lb-winner'])
    for (const id of Object.keys(recipes)) {
      expect(recipes[id]).toHaveLength(4)
      expect(new Set(recipes[id]!.map(recipe => recipe.name)).size).toBe(4)
    }
  })
})
