import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIP_VOLUME, DUCK_DOWN_MS, DUCK_STEP_MS, DUCK_UP_MS, DUCK_VOLUME, DUCKING_CUES, createClipDuck, duckHeld, duckStep } from '../../app/utils/clip-duck'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { CUE_IDS, EMOTE_CUE, type CueId } from '../../app/utils/sound-cues'

// What a Member hears of the Clip under a cue (#670, spec #927): the Clip's volume goes down for as long as a ducking cue sounds and comes back
// after it. The pure steps are tested on their own; the duck is tested through the values its sink (the player's `setVolume`) is given.

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/** A duck on the fake clock whose sink records every volume it is given. */
function setup() {
  const duck = createClipDuck()
  const volumes: number[] = []
  const detach = duck.attach(v => volumes.push(v))
  return { duck, volumes, detach, last: () => volumes.at(-1) }
}

/** Longest a cue's duck lasts from its start to the volume being back: the cue's length, the rise and one step of slack. */
const settleMs = (id: CueId) => CUE_LENGTHS[id].ms + DUCK_UP_MS + 2 * DUCK_STEP_MS

describe('duckHeld', () => {
  const sounds = [{ startMs: 100, endMs: 400 }, { startMs: 1000, endMs: 1300 }]

  it('is false before the first start and true from its start on', () => {
    expect(duckHeld(sounds, 99)).toBe(false)
    expect(duckHeld(sounds, 100)).toBe(true)
  })

  it('is true until the end and false at the end (the end is outside)', () => {
    expect(duckHeld(sounds, 399)).toBe(true)
    expect(duckHeld(sounds, 400)).toBe(false)
  })

  it('is true inside a later interval and false with none', () => {
    expect(duckHeld(sounds, 1200)).toBe(true)
    expect(duckHeld([], 0)).toBe(false)
  })
})

describe('duckStep', () => {
  it('goes down from 100 to the duck volume in the down time, linearly', () => {
    expect(duckStep(CLIP_VOLUME, true, DUCK_DOWN_MS / 2)).toBe(75)
    expect(duckStep(CLIP_VOLUME, true, DUCK_DOWN_MS)).toBe(DUCK_VOLUME)
  })

  it('goes up from the duck volume to 100 in the up time, linearly', () => {
    expect(duckStep(DUCK_VOLUME, false, DUCK_UP_MS / 2)).toBe(75)
    expect(duckStep(DUCK_VOLUME, false, DUCK_UP_MS)).toBe(CLIP_VOLUME)
  })

  it('never overshoots, however large the step', () => {
    expect(duckStep(CLIP_VOLUME, true, 60_000)).toBe(DUCK_VOLUME)
    expect(duckStep(DUCK_VOLUME, false, 60_000)).toBe(CLIP_VOLUME)
  })

  it('stays where it is at the target', () => {
    expect(duckStep(DUCK_VOLUME, true, 50)).toBe(DUCK_VOLUME)
    expect(duckStep(CLIP_VOLUME, false, 50)).toBe(CLIP_VOLUME)
  })

  it('goes down from where it is at the same rate (a re-duck during the rise)', () => {
    // 75 is half way up; the rate down is 50 per 100 ms, so 50 ms take it to 50.
    expect(duckStep(75, true, 50)).toBe(DUCK_VOLUME)
    expect(duckStep(75, true, 25)).toBe(62.5)
  })

  it('reads the config it is given', () => {
    const config = { duckVolume: 20, downMs: 200, upMs: 800 }
    expect(duckStep(CLIP_VOLUME, true, 100, config)).toBe(60)
    expect(duckStep(20, false, 400, config)).toBe(60)
  })
})

describe('the cues that duck', () => {
  it.each(['veto-seal', ...Object.values(EMOTE_CUE)] as CueId[])('%s lowers the Clip and it comes back', (id) => {
    const { duck, last } = setup()

    duck.note({ id, delayMs: 0 })
    vi.advanceTimersByTime(DUCK_DOWN_MS + DUCK_STEP_MS)
    expect(last()).toBe(DUCK_VOLUME)

    vi.advanceTimersByTime(settleMs(id))
    expect(last()).toBe(CLIP_VOLUME)
  })

  it.each(['wheel-stop', 'veto-open', 'cb-yay', 'wheel-morph'] as CueId[])('%s does not duck: the sink gets nothing but the volume of its attach', (id) => {
    const { duck, volumes } = setup()

    duck.note({ id, delayMs: 0 })
    vi.advanceTimersByTime(2000)

    expect(volumes).toEqual([CLIP_VOLUME])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('is every Emote cue and the Veto seal, and no other: a new emo-* cue fails here until it is decided', () => {
    // The ids come from the cue table, not from the duck's own list.
    const emotes = CUE_IDS.filter(id => id.startsWith('emo-'))
    expect([...DUCKING_CUES].sort()).toEqual(['veto-seal', ...emotes].sort())
    expect(Object.values(EMOTE_CUE).sort()).toEqual([...emotes].sort())
  })
})

describe('createClipDuck', () => {
  it('holds one cue down while it sounds and brings the Clip back after its end plus the rise', () => {
    const { duck, volumes, last } = setup()

    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(CUE_LENGTHS['veto-seal'].ms - DUCK_STEP_MS)
    expect(last()).toBe(DUCK_VOLUME)
    expect(Math.min(...volumes)).toBe(DUCK_VOLUME)

    vi.advanceTimersByTime(DUCK_UP_MS / 2 + DUCK_STEP_MS)
    expect(last()).toBeGreaterThan(DUCK_VOLUME)
    expect(last()).toBeLessThan(CLIP_VOLUME)

    vi.advanceTimersByTime(DUCK_UP_MS)
    expect(last()).toBe(CLIP_VOLUME)
  })

  it('goes down in steps, not at once', () => {
    const { duck, volumes } = setup()

    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(DUCK_DOWN_MS)

    expect(volumes.slice(0, 3)).toEqual([100, 88, 75])
  })

  it('keeps one duck for a burst of four Emotes inside a second: it never rises between them and returns once after the last', () => {
    const { duck, volumes, last } = setup()

    for (const id of ['emo-clap', 'emo-haha', 'emo-grr', 'emo-roar'] as const) {
      duck.note({ id, delayMs: 0 })
      vi.advanceTimersByTime(250)
    }
    // The last Emote started 250 ms ago; its file is longer than that, so the Clip is still down.
    const whileBurst = volumes.slice(1)
    expect(whileBurst.every((v, i) => i === 0 || v <= whileBurst[i - 1]!)).toBe(true)
    expect(last()).toBe(DUCK_VOLUME)

    vi.advanceTimersByTime(settleMs('emo-roar'))
    expect(last()).toBe(CLIP_VOLUME)
    // Down once, up once: the values fall to the duck volume and then only rise.
    const bottom = volumes.indexOf(DUCK_VOLUME)
    const rising = volumes.slice(volumes.lastIndexOf(DUCK_VOLUME))
    expect(bottom).toBeGreaterThan(0)
    expect(rising.every((v, i) => i === 0 || v >= rising[i - 1]!)).toBe(true)
  })

  it('goes down from the current level when a cue arrives during the rise', () => {
    const { duck, volumes, last } = setup()
    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(CUE_LENGTHS['veto-seal'].ms + DUCK_UP_MS / 2)
    const rising = last()!
    expect(rising).toBeGreaterThan(DUCK_VOLUME)
    expect(rising).toBeLessThan(CLIP_VOLUME)
    const from = volumes.length

    duck.note({ id: 'emo-clap', delayMs: 0 })
    vi.advanceTimersByTime(DUCK_DOWN_MS)

    const after = volumes.slice(from)
    expect(Math.max(...after)).toBeLessThanOrEqual(rising)
    expect(last()).toBe(DUCK_VOLUME)
  })

  it('leaves the Clip alone until a delayed cue starts', () => {
    const { duck, volumes, last } = setup()

    duck.note({ id: 'veto-seal', delayMs: 500 })
    vi.advanceTimersByTime(450)
    expect(volumes).toEqual([CLIP_VOLUME])

    vi.advanceTimersByTime(50 + DUCK_DOWN_MS + DUCK_STEP_MS)
    expect(last()).toBe(DUCK_VOLUME)
  })

  it('gives a sink that attaches during a duck the lowered volume at once', () => {
    const duck = createClipDuck()
    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(DUCK_DOWN_MS + DUCK_STEP_MS)
    const volumes: number[] = []

    duck.attach(v => volumes.push(v))

    expect(volumes).toEqual([DUCK_VOLUME])
  })

  it('gives a sink that attaches at rest the normal volume at once', () => {
    const { volumes } = setup()
    expect(volumes).toEqual([CLIP_VOLUME])
  })

  it('stops giving a detached sink volumes', () => {
    const { duck, volumes, detach } = setup()
    detach()

    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(2000)

    expect(volumes).toEqual([CLIP_VOLUME])
    expect(duck.level).toBe(CLIP_VOLUME)
  })

  it('moves its level with no sink attached, and a Clip that opens later gets it', () => {
    const duck = createClipDuck()
    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(DUCK_DOWN_MS + DUCK_STEP_MS)
    expect(duck.level).toBe(DUCK_VOLUME)
  })

  it('hands the sink whole numbers, as the player takes integers', () => {
    const { duck, volumes } = setup()
    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(2000)
    expect(volumes.every(Number.isInteger)).toBe(true)
  })

  it('stops its timer at rest', () => {
    const { duck } = setup()
    duck.note({ id: 'emo-clap', delayMs: 0 })
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(settleMs('emo-clap'))

    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops its timer and its calls when it is disposed', () => {
    const { duck, volumes } = setup()
    duck.note({ id: 'veto-seal', delayMs: 0 })
    vi.advanceTimersByTime(DUCK_STEP_MS)

    duck.dispose()
    const seen = volumes.length
    vi.advanceTimersByTime(2000)

    expect(volumes.length).toBe(seen)
    expect(vi.getTimerCount()).toBe(0)
  })
})
