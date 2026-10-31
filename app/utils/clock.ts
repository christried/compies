// The estimate of the server's clock (#162, spec #153 § Clock sync): the client asks the room for its time several
// times and keeps the answer that came back fastest, because a short round trip leaves the least room for the two
// ways to differ. The error of a sample is at most half its round trip.

/** One probe: `t0` the local time it was sent, `serverTime` the server's epoch ms when it answered, `t3` the local time the answer came. Local times are `performance.now()`. */
export interface ClockSample {
  t0: number
  serverTime: number
  t3: number
}

/**
 * The offset to add to a local `performance.now()` to get server epoch ms: `serverTime + rtt / 2 - t3` of the sample
 * with the lowest round trip; null without a sample.
 */
export function clockOffset(samples: ClockSample[]): number | null {
  let best: ClockSample | null = null
  for (const sample of samples) {
    if (!best || sample.t3 - sample.t0 < best.t3 - best.t0) best = sample
  }
  return best ? best.serverTime + (best.t3 - best.t0) / 2 - best.t3 : null
}
