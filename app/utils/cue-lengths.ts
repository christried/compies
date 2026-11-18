import type { CueId } from './sound-cues'

// The one table of the cues' lengths (#740), read by the file test (test/unit/sound-files.test.ts), the listening page (app/dev/) and the
// candidate generator (scripts/make-cue-candidates.mjs). The generator imports it with plain Node, so this file is a leaf: a type import and
// nothing at runtime, no alias. Its rows are the Length column of `reference/docs/compibert-sound.md` where the document has a clean row.

export interface CueLength {
  /** The longest the cue's file may be, in ms. */
  ms: number
  /** The cue loops until it is stopped ("1.2 s loop"). */
  loop: boolean
  /**
   * The document has a row whose Cue-id cell is exactly this id and whose Length cell is this `ms` and `loop`: test/unit/cue-lengths.test.ts
   * checks it both ways. `false` for a cue with no clean row (a cell that names several ids, or no row at all); say which in a comment.
   */
  docRow: boolean
}

// A cue's row sits under its group's line (`CUE_GROUPS`), so two tickets of different groups never touch the same lines.
export const CUE_LENGTHS: Record<CueId, CueLength> = {
  // wheel
  'wheel-windup': { ms: 500, loop: false, docRow: true },
  'wheel-tick': { ms: 30, loop: false, docRow: true },
  'wheel-stop': { ms: 600, loop: false, docRow: true },
  'wheel-morph': { ms: 500, loop: false, docRow: true },
  'wheel-slice-out': { ms: 300, loop: false, docRow: true },
  // veto
  'veto-open': { ms: 400, loop: false, docRow: true },
  'veto-clock': { ms: 40, loop: false, docRow: true },
  'veto-clip-close': { ms: 300, loop: false, docRow: true },
  'veto-seal': { ms: 300, loop: false, docRow: true },
  'veto-drumroll': { ms: 1200, loop: true, docRow: true },
  'veto-reveal': { ms: 800, loop: false, docRow: true },
  // coin
  // standings
  // board
  // ceremony
  // tour
}
