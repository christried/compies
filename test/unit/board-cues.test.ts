import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DRAG_TEST_HOLD_MS, dragRunCues } from '../../app/dev/listening-model'
import { CUE_GROUPS, CUE_IDS, cueFilesOf, reachableGroups } from '../../app/utils/sound-cues'

// The Game board's sounds (#742, spec #718): the group's rule, its three files and the listening page's test drag. The hooks themselves are
// test/nuxt/game-board-cues.test.ts, the files an Event page requests test/nuxt/event-cues-board.test.ts.

const BOARD = ['drag-pick', 'drag-snap', 'drag-reject'] as const

describe('the Game board\'s group', () => {
  it('is reached by its own flag, without a wheel', () => {
    expect(reachableGroups({ wheel: false, vetoAllowance: 0, vetoWindow: false, board: true })).toEqual(['board'])
  })

  it('comes after the Standings\' group and after the wheel\'s groups', () => {
    expect(reachableGroups({ wheel: false, vetoAllowance: 0, vetoWindow: false, standings: true, board: true })).toEqual(['standings', 'board'])
    expect(reachableGroups({ wheel: true, vetoAllowance: 0, vetoWindow: false, board: true })).toEqual(['wheel', 'board'])
  })

  it('is not reached when its flag is false or absent, whatever else the read says', () => {
    expect(reachableGroups({ wheel: false, vetoAllowance: 0, vetoWindow: false, board: false })).toEqual([])
    expect(reachableGroups({ wheel: false, vetoAllowance: 0, vetoWindow: false })).toEqual([])
    expect(reachableGroups({ wheel: false, vetoAllowance: 3, vetoWindow: true })).toEqual([])
    expect(reachableGroups({ wheel: false, vetoAllowance: 0, vetoWindow: false, standings: true })).toEqual(['standings'])
  })

  it('holds the three cues, each only in this group, in the order of CUE_IDS', () => {
    expect(cueFilesOf(['board'])).toEqual(BOARD)
    for (const id of BOARD) expect(CUE_GROUPS[id], id).toEqual(['board'])
    expect(CUE_IDS.filter(id => (BOARD as readonly string[]).includes(id))).toEqual(BOARD)
  })
})

describe('dragRunCues (the listening page\'s test drag)', () => {
  it('lifts, then snaps when the move was taken', () => {
    expect(dragRunCues('taken')).toEqual([{ id: 'drag-pick', delayMs: 0 }, { id: 'drag-snap', delayMs: DRAG_TEST_HOLD_MS }])
  })

  it('lifts, then bounces back when the move was refused', () => {
    expect(dragRunCues('refused')).toEqual([{ id: 'drag-pick', delayMs: 0 }, { id: 'drag-reject', delayMs: DRAG_TEST_HOLD_MS }])
  })
})

describe('the Game board\'s recipes', () => {
  it('has four recipes for each of the three ids', async () => {
    const recipes = (await import(pathToFileURL(resolve(import.meta.dirname, '../../scripts/cue-recipes/board.mjs')).href)).default as Record<string, unknown[]>

    expect(Object.keys(recipes).sort()).toEqual([...BOARD].sort())
    for (const id of BOARD) expect(recipes[id], id).toHaveLength(4)
  })
})
