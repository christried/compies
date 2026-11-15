import { SNAP_EASE, bezier, sliceSpans, wheelAngle, type WheelTiming } from './wheel'
import { pinAngles } from './wheel-look'

// The pins' passes of the top and the flapper's kick at each (#522, spec #503 § The motion, 04-motion § Lucky Wheel). Pure functions of the
// spin's instants and, for the kick, one server time: the same on every device, a late joiner included, with nothing replayed. Nothing
// here knows Vue, a clock, a name or a game, so a Hidden wheel's Member gets the same crossings as the Host. 0.13.3's pin ticks use
// `pinCrossings` too: this is the one place the crossings are worked out, and it remembers the last spin's list (#594, read-only for callers).

/** At each crossing the flapper kicks up by this many degrees (04-motion: 30, `rotation 30 -> 0`; the sign is the SVG sense, see `flapperKick`). */
const FLAPPER_KICK_DEG = 30
/** and falls back to rest over this long (04-motion: 0.13 s, `EASE.snap`). */
const FLAPPER_KICK_MS = 130
/** Bisection steps: a 10 000 ms spin is resolved to 10 000 / 2^24, about 0.0006 ms. */
const SEARCH_STEPS = 24
/** Ternary steps for the peak of the overshoot: each keeps two thirds of the span. */
const PEAK_STEPS = 60

export type PinCrossing = { at: number, pin: number, back: boolean }

/** The last spin's list (#594): the wheel's `crossings` and the cue plan ask for the same spin on every refetch, so an equal one is worked out once. */
let memo: { spin: WheelTiming, crossings: readonly PinCrossing[] } | null = null

/**
 * The server times (epoch ms) at which a pin's centre is at the top for a whole spin, in order, each with the slice whose start edge the
 * pin marks (`pin`, an index into `sliceSpans`, as `pinAngles` lists them). A crossing carries its direction: the ease overshoots the final
 * angle by a few degrees near the end and creeps back, so a pin in that stretch is crossed twice, forward and then `back`. Both kick the
 * flapper and both are for a tick to sound; `back` lets a sound choose.
 *
 * Found by searching `wheelAngle` itself, not from a closed form: the angle function stays the one place the ease lives, and the crossings
 * follow it when the spin's length or turns change. The spin is worked in milliseconds from its start, so the epoch's size costs no precision.
 *
 * One entry is kept, keyed on the five fields of the spin: an equal spin gets the same array back (a caller must not change it). The listening
 * page asks with changing timings and only pays a recompute.
 */
export function pinCrossings(spin: WheelTiming): readonly PinCrossing[] {
  const length = spin.stopAt - spin.spinStartAt
  if (spin.slices < 1 || length <= 0) return []
  if (memo && memo.spin.spinStartAt === spin.spinStartAt && memo.spin.stopAt === spin.stopAt && memo.spin.slices === spin.slices
    && memo.spin.resultIndex === spin.resultIndex && memo.spin.resultOffset === spin.resultOffset) return memo.crossings

  const local: WheelTiming = { ...spin, spinStartAt: 0, stopAt: length }
  /** How far the wheel has turned (degrees, 0 up) `ms` into the spin. */
  const turned = (ms: number) => -wheelAngle(local, ms, false)

  // The turned angle rises to a maximum at about 88 % of the spin and falls back to its final value (the overshoot); if an ease change
  // removes the overshoot, the peak converges to the end and everything below stays right.
  let low = 0
  let high = length
  for (let step = 0; step < PEAK_STEPS; step++) {
    const left = low + (high - low) / 3
    const right = high - (high - low) / 3
    if (turned(left) < turned(right)) low = left
    else high = right
  }
  const peak = (low + high) / 2
  const farthest = turned(peak)
  const final = turned(length)

  const crossings: PinCrossing[] = []
  const pins = pinAngles(sliceSpans(spin.slices, -1, 0))
  for (let lap = 0; 360 * lap < farthest; lap++) {
    pins.forEach((angle, pin) => {
      const level = angle + 360 * lap
      // Level 0 is the first slice's pin under the tip at the start: no crossing. A level the wheel never reaches is not passed.
      if (level <= 0 || level >= farthest) return
      crossings.push({ at: spin.spinStartAt + firstReach(turned, level, peak), pin, back: false })
      if (level > final) crossings.push({ at: spin.spinStartAt + lastReach(turned, level, peak, length), pin, back: true })
    })
  }
  crossings.sort((a, b) => a.at - b.at)
  memo = { spin: { ...spin }, crossings }
  return crossings
}

/** The first moment in `[0, peak]` the wheel has turned `level` degrees: `turned` rises all along there. */
function firstReach(turned: (ms: number) => number, level: number, peak: number): number {
  let low = 0
  let high = peak
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const middle = (low + high) / 2
    if (turned(middle) >= level) high = middle
    else low = middle
  }
  return (low + high) / 2
}

/** The last moment in `[peak, length]` the wheel is still at `level` degrees or more: `turned` falls back from the peak to its final value there. */
function lastReach(turned: (ms: number) => number, level: number, peak: number, length: number): number {
  let low = peak
  let high = length
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const middle = (low + high) / 2
    if (turned(middle) >= level) low = middle
    else high = middle
  }
  return (low + high) / 2
}

/**
 * The flapper's angle in degrees about its hinge at server time `nowMs`, SVG sense (positive turns clockwise, the tip to the left): the
 * wheel turns counter-clockwise, so the pins pass the tip from right to left and push it left, and the kick is +30, not the ticket's -30
 * (#522). It jumps to 30 at the last crossing at or before `nowMs` and falls back to 0 over 0.13 s along `EASE.snap`. While the next
 * pin comes less than 0.13 s after that crossing the flapper is held up at 30 instead of falling and kicking again, until the pin that
 * follows a gap of 0.13 s or more. Reduced motion has no kicks. A function of the crossings (sorted) and `nowMs` alone.
 */
export function flapperKick(crossings: readonly { at: number }[], nowMs: number, reduced: boolean): number {
  if (reduced) return 0
  // The first crossing after `nowMs`; the one before it is the last at or before.
  let low = 0
  let high = crossings.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (crossings[middle]!.at > nowMs) high = middle
    else low = middle + 1
  }
  const last = crossings[low - 1]
  if (!last) return 0
  const since = nowMs - last.at
  if (since >= FLAPPER_KICK_MS) return 0
  const next = crossings[low]
  if (next && next.at - last.at < FLAPPER_KICK_MS) return FLAPPER_KICK_DEG
  return FLAPPER_KICK_DEG * (1 - bezier(SNAP_EASE, since / FLAPPER_KICK_MS))
}
