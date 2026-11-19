// The cue ids (#504, #718), = the cue id of `compibert-sound.md` and the file name in the sound folder. A leaf with no import, so plain Node
// reads it as it is (type stripping): the candidate generator and the shipping script import it from `scripts/` (#828), where they used to
// read it out of `sound-cues.ts`'s text with a regex. `sound-cues.ts` re-exports both names, so the app imports them from there.

/**
 * A new cue is one row in each table keyed by `CueId` (volume and group in `sound-cues.ts`, `CUE_LENGTHS`, the listening brief and `MOMENT_OF`)
 * and one recipe file (#740); the rows sit under their group's comment line, so two tickets of different groups never touch the same lines.
 */
export const CUE_IDS = [
  // wheel
  'wheel-windup', 'wheel-tick', 'wheel-stop', 'wheel-morph', 'wheel-slice-out',
  'cb-hype', 'cb-gulp', 'cb-yay',
  // veto
  'veto-open', 'veto-clock', 'veto-clip-close', 'veto-seal', 'veto-drumroll', 'veto-reveal',
  // coin
  'coin-toss', 'coin-spin', 'coin-land', 'coin-result',
  // standings
  'lb-swap', 'lb-count', 'lb-winner',
  // board
  'drag-pick', 'drag-snap', 'drag-reject',
  // ceremony
  'cer-drop', 'cer-row', 'cer-run', 'cer-trip', 'cer-bonk',
  'cer-stamp', 'cer-fanfare', 'cer-crowd',
  'cb-laugh',
  // tour
  'cb-hi',
] as const
export type CueId = (typeof CUE_IDS)[number]
