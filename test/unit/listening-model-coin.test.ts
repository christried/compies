import { describe, expect, it } from 'vitest'
import { COIN_DURATION_MS } from '../../shared/coin'
import { LEAD_MS, buildCoinRun } from '../../app/dev/listening-model'
import { coinCuePlan } from '../../app/utils/sound-cues'

// The listening page's „Test toss“ (#669): the Coin flip's four cues through the real `coinCuePlan`, from the two instants `planOf` copies.

const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

describe('buildCoinRun', () => {
  it('holds exactly the cues of coinCuePlan for the same two instants', () => {
    const run = buildCoinRun(false, NOW)

    expect(run.plan).toEqual(coinCuePlan({ toss: { startedAt: iso(run.startedAt), landsAt: iso(run.landsAt) }, reducedMotion: false }))
    expect(run.plan.map(cue => cue.id)).toEqual(['coin-toss', 'coin-spin', 'coin-land', 'coin-result'])
  })

  it('starts LEAD_MS after now and lands COIN_DURATION_MS later', () => {
    const run = buildCoinRun(false, NOW)

    expect(run.startedAt).toBe(NOW + LEAD_MS)
    expect(run.landsAt).toBe(NOW + LEAD_MS + COIN_DURATION_MS)
    expect(run.plan[0]!.at).toBe(run.startedAt)
    expect(run.plan.at(-1)!.at).toBe(run.landsAt)
  })

  it('has two cues under reduced motion: the landing and the result', () => {
    expect(buildCoinRun(true, NOW).plan.map(cue => cue.id)).toEqual(['coin-land', 'coin-result'])
  })
})
