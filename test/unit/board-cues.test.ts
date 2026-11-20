import { describe, expect, it } from 'vitest'
import { DRAG_TEST_HOLD_MS, dragRunCues } from '../../app/dev/listening-model'
import { CUE_GROUPS, CUE_IDS, cueFilesOf } from '../../app/utils/sound-cues'

// The Game board's sounds (#742, spec #718): its three files and the listening page's test drag. The group's rule is a row of the table in
// sound-cues.test.ts, the hooks themselves are test/nuxt/game-board-cues.test.ts, the files an Event page requests test/nuxt/event-cues-board.test.ts.

const BOARD = ['drag-pick', 'drag-snap', 'drag-reject'] as const

describe('the Game board\'s group', () => {
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
