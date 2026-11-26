// The reaction layer's rules (#928, 04-motion § Transition rules): a timed reaction over the rig's base state. Pure on purpose, no GSAP and no DOM:
// `CompibertRig.vue` owns the timer, this file owns which reaction may take over and how long each one lasts.
import type { RigState } from './compibert-rig'

export interface Reaction {
  state: RigState
}

/** 04-motion § State table: the priority (1 low … 3 high; `confused` at 4 is a base here and blocks them all) and the length in seconds. */
export const RIG_REACTIONS: Partial<Record<RigState, { priority: number, seconds: number }>> = {
  wave: { priority: 1, seconds: 2.2 },
  laugh: { priority: 2, seconds: 2.4 },
  angry: { priority: 2, seconds: 2.6 },
  clap: { priority: 2, seconds: 2 },
  roar: { priority: 2, seconds: 2.4 },
  sad: { priority: 3, seconds: 4 },
  cheer: { priority: 3, seconds: 4 },
}

/** How long `reaction` shows: the table's length for its state. */
export function reactionSeconds(reaction: Reaction): number {
  return RIG_REACTIONS[reaction.state]?.seconds ?? 0
}

/**
 * Whether `incoming` may start over the `running` reaction (null: none) on the `base` state. A state that is no reaction is never admitted,
 * and none is while the base is `confused` (the errors block). Equal or higher priority replaces the running one, lower is dropped.
 */
export function admitReaction(base: RigState, running: RigState | null, incoming: RigState): boolean {
  const next = RIG_REACTIONS[incoming]
  if (!next || base === 'confused') return false
  const current = running === null ? undefined : RIG_REACTIONS[running]
  return !current || next.priority >= current.priority
}
