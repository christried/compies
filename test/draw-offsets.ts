import { drawInstants } from '../shared/draw-timeline'

// The Draw timeline's instants as offsets from the commit (#414), so a test that moves the clock past one takes it from the module
// that decides it, not from `1500 + 6000 + 60_000` of its own. The window's length depends on the drawn game's clip (#505):
// `SPIN`, `SET` and `WINDOW_MS` are for a game without a video (a seed game of the scenario has none), `offsetsFor` and
// `windowMsFor` for a game with a clip of the given length in seconds. Not a test file.
export const offsetsFor = (kind: 'spin' | 'set', clipLength: number | null) => {
  const instants = drawInstants({ kind, commitAt: 0, windowOpens: true, clipLength })
  return { lead: instants.spinStartAt?.getTime() ?? 0, stop: instants.stopAt.getTime(), end: instants.vetoEndsAt!.getTime() }
}

/** ms after the commit of a spin's instants for a game without a video (1500, 7500, 37500), from the timeline. */
export const SPIN = offsetsFor('spin', null)
/** ms after the commit of a set draw's instants for a game without a video (0, 0, 30000), from the timeline. */
export const SET = offsetsFor('set', null)
/** The Veto window's length for a game without a video. */
export const WINDOW_MS = SET.end - SET.stop
/** The Veto window's length for a game with a clip of `clipLength` seconds (null: no video). */
export const windowMsFor = (clipLength: number | null) => {
  const { stop, end } = offsetsFor('set', clipLength)
  return end - stop
}
