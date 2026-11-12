import { CROSSFADE_MS, bezier } from './wheel'

// The pops at the stop (#523, spec #503 § The motion, 04-motion § Lucky Wheel `stop`): the drawn slice's label `scaleY 0 -> 1.25 -> 1` and
// the result card `scale .6 -> 1.08 -> 1` with its opacity, each over 0.42 s on `EASE.pop`. The reference runs each as one Web Animation
// with three keyframes and one easing over the whole run, so the keyframes sit at the eased progress 0, 0.5 and 1 and the value is linear
// between them; where the ease overshoots (progress above 1) the last segment runs on in a straight line, as a Web Animation does.
// Pure functions of the time since the stop, with no clock and no DOM: the same on every device, and a late joiner or a tab that was
// hidden reads the end state with nothing replayed (ADR 0013). The caller gives the time since the stop; the stop's own comparison stays
// in `stopReached` (shared/draw-timeline.ts), so no copy of it is made here.

/** `EASE.pop` (04-motion), the one ease of both pops. */
const POP_EASE = [0.34, 1.56, 0.64, 1] as const
const POP_MS = 420

/** The value at an eased progress for the keyframes `from`, `peak` at 0.5 and 1 at 1 (a straight line through the last two past 1). */
function keyframes(progress: number, from: number, peak: number): number {
  return progress < 0.5 ? from + (peak - from) * (progress / 0.5) : peak + (1 - peak) * ((progress - 0.5) / 0.5)
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

/** Reduced motion has no scale: the opacity rises linearly over the Hidden reveal's crossfade (04-motion: the pops crossfade). */
const crossfade = (elapsed: number) => clamp01(elapsed / CROSSFADE_MS)

/** The result card `elapsed` ms after the stop: its scale and opacity. The reference's last keyframe has no opacity, which then stays at 1. */
export function cardPop(elapsed: number, reduced: boolean): { scale: number, opacity: number } {
  if (reduced) return { scale: 1, opacity: crossfade(elapsed) }
  if (elapsed >= POP_MS) return { scale: 1, opacity: 1 }
  const progress = bezier(POP_EASE, Math.max(elapsed, 0) / POP_MS)
  return { scale: keyframes(progress, 0.6, 1.08), opacity: clamp01(progress / 0.5) }
}

/** The drawn slice's label `elapsed` ms after the stop: its scaleY about its own centre line, and its opacity (1 but under reduced motion). */
export function labelPop(elapsed: number, reduced: boolean): { scaleY: number, opacity: number } {
  if (reduced) return { scaleY: 1, opacity: crossfade(elapsed) }
  if (elapsed >= POP_MS) return { scaleY: 1, opacity: 1 }
  return { scaleY: keyframes(bezier(POP_EASE, Math.max(elapsed, 0) / POP_MS), 0, 1.25), opacity: 1 }
}
