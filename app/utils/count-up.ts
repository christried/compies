// The count-up of a number in the Standings (#276, 04-motion § Leaderboard: CpNum counts 0.6 s `power2.out`, at most 15 ticks a second).
// Pure, so the curve holds without a clock or a DOM; CpNum owns the frame loop.

/** The whole number to show `elapsedMs` into a count from `from` to `to` that lasts `durationMs`: power2.out (1 − (1 − p)²), rounded; `to` at or after the end. */
export function countAt(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to
  const progress = Math.max(0, elapsedMs) / durationMs
  return Math.round(from + (to - from) * (1 - (1 - progress) ** 2))
}

/** 04-motion: at most 15 displayed changes a second. */
export const COUNT_TICK_MS = 1000 / 15

/**
 * The delays (ms after the count starts, ascending) of the counter's displayed changes (#741): `lb-count` ticks with them. The sound and the
 * counter use the same constants and curve (`COUNT_TICK_MS`, `countAt`), though not one loop: the counter's writes follow its frames, so they drift
 * from this grid by a few frames. The counter writes on the first frame at or after each step of `COUNT_TICK_MS`; a tick is a step where `countAt` shows
 * another number than the one before, then one at `durationMs` when the last shown number is not `to` yet. Never closer than the step, so never
 * more than 15 a second. Empty for a count that goes nowhere or has no duration (the number is there at once).
 */
export function countTicks(from: number, to: number, durationMs: number): number[] {
  if (from === to || durationMs <= 0) return []
  const ticks: number[] = []
  let shown = from
  for (let step = 1; step * COUNT_TICK_MS < durationMs; step++) {
    const at = step * COUNT_TICK_MS
    const value = countAt(from, to, at, durationMs)
    if (value === shown) continue
    ticks.push(at)
    shown = value
  }
  if (shown !== to) ticks.push(durationMs)
  return ticks
}
