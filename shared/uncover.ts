// The uncover of a Hidden wheel (#957, spec #961 § Uncover, GLOSSARY: Hidden wheel): once every Round up to the Game count has its Result, while
// the Session runs, the Host uncovers the wheel, and from then on it is a visible wheel for everyone. The Event keeps its Hidden wheel setting
// (so the Pool preview stays off); what hides the games now is `wheelHidden`. Pure, so the route, the Event read, the spin and the page agree.
// The Worker does not import this file.

import type { Phase } from './phase'

/**
 * Whether the wheel hides its games now (#957): the Event's Hidden wheel setting, until the Host uncovers it. The server's wheel read and spin
 * and the page's wheel and cue plans ask this, never the setting alone.
 */
export function wheelHidden(hiddenWheel: boolean, uncovered: boolean): boolean {
  return hiddenWheel && !uncovered
}

/** Why the Hidden wheel cannot be uncovered now (#957), in the order they are checked. */
export type UncoverRejection = 'not_host' | 'wrong_phase' | 'no_running_session' | 'wheel_not_hidden' | 'wheel_uncovered' | 'results_missing'

export interface UncoverInput {
  isHost: boolean
  phase: Phase
  /** A Session runs: the wheel is on screen only then. */
  running: boolean
  /** The Event's Hidden wheel setting (false without a Lucky Wheel). */
  hiddenWheel: boolean
  /** The Host has uncovered the wheel already. */
  uncovered: boolean
  /** Every Round up to the Game count has its Result (EndFacts `complete`). */
  complete: boolean
}

/**
 * The reason the Host cannot uncover the Hidden wheel now, or null (#957), in the order they are checked: the Host asks, the Event runs
 * (a finished Event has no wheel on screen), with a Running Session, its wheel is hidden and not yet uncovered, and every Round up to the
 * Game count has its Result, so no game is left to draw in secret. A Tie does not refuse: a Round added after it spins the uncovered wheel openly.
 */
export function uncoverRejection({ isHost, phase, running, hiddenWheel, uncovered, complete }: UncoverInput): UncoverRejection | null {
  if (!isHost) return 'not_host'
  if (phase !== 'running') return 'wrong_phase'
  if (!running) return 'no_running_session'
  if (!hiddenWheel) return 'wheel_not_hidden'
  if (uncovered) return 'wheel_uncovered'
  return complete ? null : 'results_missing'
}
