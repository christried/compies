import { describe, expect, it } from 'vitest'
import { LEAD_MS, buildRun, configFor, type RunConfig } from '../../app/dev/listening-model'
import { TICK_MIN_GAP_MS, wheelVoicePlan } from '../../app/utils/sound-cues'
import { REVEAL_AFTER_MS } from '../../app/utils/wheel'

// The listening page's „Test voice run“ (#671): Compibert's voice through the real `wheelVoicePlan` beside the real wheel. The plain spin
// run stays voice-free, so `wheel-tick` judged alone is not mixed with him.

const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)
const config = (fields: Partial<RunConfig> = {}): RunConfig => ({
  spinMs: 6000, hidden: false, reduced: false, windowMs: 0, start: 'beginning', clip: true, vetoes: 0, tickGapMs: TICK_MIN_GAP_MS, voice: true, ...fields,
})

describe('buildRun of a voice run', () => {
  it('holds exactly the cues of wheelVoicePlan for the run\'s spin, and no wheel or veto cue', () => {
    const run = buildRun(config(), NOW, 1)

    expect(run.plan).toEqual(wheelVoicePlan({ spin: { spinStartAt: run.spin!.spinStartAt, stopAt: run.spin!.stopAt }, hiddenWheel: false, reducedMotion: false }))
    expect(run.plan.map(cue => cue.id)).toEqual(['cb-hype', 'cb-gulp', 'cb-yay'])
    expect(run.plan[0]!.at).toBe(NOW + LEAD_MS)
    expect(run.tickCount).toBe(0)
  })

  it('moves the cheer by the reveal\'s half second under a Hidden wheel', () => {
    const open = buildRun(config(), NOW, 1).plan.find(cue => cue.id === 'cb-yay')!
    const hidden = buildRun(config({ hidden: true }), NOW, 1).plan.find(cue => cue.id === 'cb-yay')!

    expect(hidden.at - open.at).toBe(REVEAL_AFTER_MS)
  })

  it('leaves only the cheer under reduced motion', () => {
    expect(buildRun(config({ reduced: true }), NOW, 1).plan.map(cue => cue.id)).toEqual(['cb-yay'])
  })

  it('is not mixed into a plain spin run', () => {
    const plain = buildRun(config({ voice: false }), NOW, 1)

    expect(plain.plan.some(cue => cue.id.startsWith('cb-'))).toBe(false)
    expect(plain.plan.some(cue => cue.id === 'wheel-tick')).toBe(true)
  })

  it('keeps the tick cap out of it, whatever the page holds', () => {
    expect(buildRun(config({ tickGapMs: 90 }), NOW, 1).plan.map(cue => cue.id)).toEqual(['cb-hype', 'cb-gulp', 'cb-yay'])
  })
})

describe('configFor a voice run', () => {
  const controls = { spin: 'none', window: 'none', start: 'last12', clip: true, vetoes: 1, hidden: false, reduced: false, tickGapMs: 40 } as const

  it('is a spin config with no window and the voice switched on', () => {
    expect(configFor('voice', controls)).toMatchObject({ spinMs: 6000, windowMs: 0, voice: true })
    expect(configFor('voice', { ...controls, spin: '10' })).toMatchObject({ spinMs: 10_000, voice: true })
    expect(configFor('spin', controls).voice).not.toBe(true)
  })
})
