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
