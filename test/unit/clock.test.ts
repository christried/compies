import { describe, expect, it } from 'vitest'
import { clockOffset, type ClockSample } from '../../app/utils/clock'

// The estimator of the server clock (#162, spec #153 § Clock sync): the offset of the probe with the lowest round trip.
// The links are simulated, so the true offset is known: a client whose own clock (performance.now) is `skew` ms
// behind the server's reads server time as its own time + the true offset.

/** A small seeded random source, so the jitter is the same on every run. */
function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** One probe over a link with these one-way delays; the client's clock starts at `local` and is `skew` ms behind the server. */
function probe(local: number, skew: number, out: number, back: number): ClockSample {
  const t0 = local
  const serverTime = t0 + skew + out // the server answers the moment the probe arrives
  const t3 = t0 + out + back
  return { t0, serverTime, t3 }
}

describe('clockOffset', () => {
  it('is null without a probe', () => {
    expect(clockOffset([])).toBeNull()
  })

  it('is exact on a symmetric link', () => {
    const skew = 5_000
    expect(clockOffset([probe(1000, skew, 30, 30)])).toBeCloseTo(skew, 6)
  })

  it('is off by half the difference of the two ways on an asymmetric link, and never by more than half the round trip', () => {
    const skew = 12_345
    const offset = clockOffset([probe(1000, skew, 100, 20)])!

    expect(offset - skew).toBeCloseTo((100 - 20) / 2, 6)
    expect(Math.abs(offset - skew)).toBeLessThanOrEqual((100 + 20) / 2)
  })

  it('takes the probe with the lowest round trip, whatever order they come in', () => {
    const skew = 777
    const samples = [
      probe(1000, skew, 150, 20), // rtt 170, the slow one is far off
      probe(1200, skew, 31, 29), // rtt 60
      probe(1400, skew, 80, 90), // rtt 170
    ]

    expect(Math.abs(clockOffset(samples)! - skew)).toBeLessThanOrEqual(60 / 2)
    expect(Math.abs(clockOffset([...samples].reverse())! - skew)).toBeLessThanOrEqual(60 / 2)
  })

  it('stays within half the lowest round trip over many jittered, asymmetric links', () => {
    const next = random(7)
    for (let run = 0; run < 200; run++) {
      const skew = Math.round(next() * 1e6) - 5e5
      const samples = Array.from({ length: 6 }, (_, index) => probe(index * 100, skew, 5 + next() * 300, 5 + next() * 300))
      const lowest = Math.min(...samples.map(sample => sample.t3 - sample.t0))

      expect(Math.abs(clockOffset(samples)! - skew)).toBeLessThanOrEqual(lowest / 2 + 1e-9)
    }
  })

  it('puts two clients on a normal connection within 50 ms of each other', () => {
    const next = random(42)
    const oneWay = () => 20 + next() * 60 // 20 to 80 ms
    for (let run = 0; run < 200; run++) {
      // Two devices with clocks of their own, both asking the same server.
      const skewA = Math.round(next() * 1e6)
      const skewB = Math.round(next() * 1e6)
      const offsetA = clockOffset(Array.from({ length: 6 }, (_, index) => probe(index * 100, skewA, oneWay(), oneWay())))!
      const offsetB = clockOffset(Array.from({ length: 6 }, (_, index) => probe(index * 100, skewB, oneWay(), oneWay())))!

      // At the same server instant each device's estimate of the server's time is its own time + its offset.
      const serverNow = 1_000_000
      const estimateA = (serverNow - skewA) + offsetA
      const estimateB = (serverNow - skewB) + offsetB

      expect(Math.abs(estimateA - estimateB)).toBeLessThan(50)
    }
  })
})
