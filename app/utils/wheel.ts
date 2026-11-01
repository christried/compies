import { SPIN_REDUCED_MS } from '~~/shared/rounds'

// The Lucky Wheel's motion as pure functions of server time (#229, 04-motion § Lucky Wheel, § Synchronised moments): where
// the wheel stands, and how the drawn slice leaves it. Nothing here reads a clock, so every device that asks at the same server
// time gets the same answer, a late joiner included. The component drives them with requestAnimationFrame.

/** What the motion needs of a spin: the instants (epoch ms), the slices and where the pointer lands. */
export interface WheelTiming {
  spinStartAt: number
  stopAt: number
  slices: number
  resultIndex: number
  /** Where in the result slice the pointer stops, a fraction from 0 up to 1. */
  resultOffset: number
}

/** The wheel's ease, `cubic-bezier(.15,.75,.25,1.035)` (04-motion): fast at first, braking late, and it overshoots a little by design. */
const SPIN_EASE = [0.15, 0.75, 0.25, 1.035] as const
/** `EASE.snap` (04-motion), the reduced-motion spin's ease. */
const SNAP_EASE = [0.2, 0, 0, 1] as const
/** `EASE.io`, the ease of the slices closing the gap. */
const IO_EASE = [0.65, 0, 0.35, 1] as const

/** Full turns past the target, so the spin is a spin. */
const EXTRA_TURNS = 5
/** The drawn slice leaves this long after the stop, a Hidden wheel a little later: its reveal comes first (04-motion). */
const REMOVE_AFTER_MS = 2200
const REMOVE_AFTER_HIDDEN_MS = 2800
/** The other slices close the gap in this long. */
const REMOVE_MS = 600
/** Under reduced motion the drawn slice fades for this long, then the others redistribute at once. */
const REMOVE_REDUCED_FADE_MS = 200

/** The y of a CSS cubic-bezier at progress `x` (0 to 1): the curve's x is solved for its parameter, by Newton's steps and then bisection. */
function bezier([x1, y1, x2, y2]: readonly [number, number, number, number], x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const coordinate = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3
  const slope = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t ** 2
  let t = x
  for (let step = 0; step < 8; step++) {
    const error = coordinate(x1, x2, t) - x
    if (Math.abs(error) < 1e-7) return coordinate(y1, y2, t)
    const rate = slope(x1, x2, t)
    if (Math.abs(rate) < 1e-6) break
    t -= error / rate
  }
  let low = 0
  let high = 1
  t = x
  for (let step = 0; step < 40; step++) {
    if (coordinate(x1, x2, t) < x) low = t
    else high = t
    t = (low + high) / 2
  }
  return coordinate(y1, y2, t)
}

/** The angle (degrees, clockwise positive) the wheel rests at when the spin has stopped: the pointer at the top is in the result slice, at its offset, and five turns lie behind. */
export function finalAngle({ slices, resultIndex, resultOffset }: WheelTiming): number {
  return -(resultIndex + resultOffset) * (360 / slices) - 360 * EXTRA_TURNS
}

/**
 * The wheel's angle at server time `nowMs`. It starts at 0 for every device, stands there until the spin starts, eases to the
 * final angle at `stopAt` and stays. Reduced motion stands until the last 1.2 s, then snaps to the same final angle at the same stop.
 */
export function wheelAngle(spin: WheelTiming, nowMs: number, reduced: boolean): number {
  const from = reduced ? spin.stopAt - SPIN_REDUCED_MS : spin.spinStartAt
  const progress = (nowMs - from) / (spin.stopAt - from)
  // `+ 0` turns a -0 (final times 0) into 0.
  return finalAngle(spin) * bezier(reduced ? SNAP_EASE : SPIN_EASE, Math.min(Math.max(progress, 0), 1)) + 0
}

/** When the drawn slice starts to leave (server ms). */
function removalStart(spin: Pick<WheelTiming, 'stopAt'>, hidden: boolean): number {
  return spin.stopAt + (hidden ? REMOVE_AFTER_HIDDEN_MS : REMOVE_AFTER_MS)
}

/** When the drawn slice is gone and the others have closed the gap (server ms). */
export function removalEnd(spin: Pick<WheelTiming, 'stopAt'>, hidden: boolean): number {
  return removalStart(spin, hidden) + REMOVE_MS
}

/**
 * How far the drawn slice has left, 0 to 1 (04-motion: 0.6 s `EASE.io`, from 2.2 s after the stop, 2.8 s on a Hidden wheel).
 * Reduced motion: 0 during a 0.2 s fade of the drawn slice, then 1 at once.
 */
export function removalEase(spin: Pick<WheelTiming, 'stopAt'>, nowMs: number, hidden: boolean, reduced: boolean): number {
  const elapsed = nowMs - removalStart(spin, hidden)
  if (reduced) return elapsed >= REMOVE_REDUCED_FADE_MS ? 1 : 0
  return bezier(IO_EASE, Math.min(Math.max(elapsed / REMOVE_MS, 0), 1))
}

/** The angular span of each slice, in degrees from the top, while the slice `drawn` leaves (`ease` 0 = all slices alike, 1 = it is gone and the others share the circle). */
export function sliceSpans(slices: number, drawn: number, ease: number): { start: number, end: number }[] {
  const even = 360 / slices
  const closed = slices > 1 ? 360 / (slices - 1) : 0
  let start = 0
  return Array.from({ length: slices }, (_, index) => {
    const size = index === drawn ? even * (1 - ease) : even + (closed - even) * ease
    const span = { start, end: start + size }
    start += size
    return span
  })
}
