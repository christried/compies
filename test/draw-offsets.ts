import { drawInstants } from '../shared/draw-timeline'

// The Draw timeline's instants as offsets from the commit (#414), so a test that moves the clock past one takes it from the module
// that decides it, not from `1500 + 6000 + 60_000` of its own. Not a test file.
const offsets = (kind: 'spin' | 'set') => {
  const instants = drawInstants({ kind, commitAt: 0, windowOpens: true })
  return { lead: instants.spinStartAt?.getTime() ?? 0, stop: instants.stopAt.getTime(), end: instants.vetoEndsAt!.getTime() }
}

/** ms after the commit of a spin's instants (1500, 7500, 67500), from the timeline. */
export const SPIN = offsets('spin')
/** ms after the commit of a set draw's instants (0, 0, 60000), from the timeline. */
export const SET = offsets('set')
/** The Veto window's length. */
export const WINDOW_MS = SET.end - SET.stop
