import { afterEach, describe, expect, it, vi } from 'vitest'
import { countdownBurst } from '../../app/utils/motion'

// The zero burst (04-motion § Countdown, #340): seven Web Animations sought to the time since zero. Whether it played is its return value (#363):
// it is false past its longest track, read from the tokens it just used, for reduced motion, for a time before zero and without a usable part.
// The seam is the computed style of `<html>` (as in motion-ms.test.ts) and seven fake elements that record what they were asked to animate.

const EASINGS = {
  '--cp-ease-in': 'cubic-bezier(.7,0,.84,0)',
  '--cp-ease-out': 'cubic-bezier(.16,1,.3,1)',
  '--cp-ease-pop': 'cubic-bezier(.34,1.56,.64,1)',
  '--cp-ease-snap': 'cubic-bezier(.2,0,0,1)',
}
const MS_SPELLING = { '--cp-dur-fast': '140ms', '--cp-dur-base': '220ms', '--cp-dur-slow': '360ms', '--cp-dur-slower': '600ms' }
/** What the production CSS minifier writes for the same values (#370). */
const SECONDS_SPELLING = { '--cp-dur-fast': '.14s', '--cp-dur-base': '.22s', '--cp-dur-slow': '.36s', '--cp-dur-slower': '.6s' }

function tokens(values: Record<string, string>, motion: 'full' | 'reduced' = 'full') {
  const all: Record<string, string> = { '--cp-motion': motion, ...EASINGS, ...values }
  vi.stubGlobal('document', { documentElement: {} })
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => all[name] ?? '' }))
}

interface Fake { animate: ReturnType<typeof vi.fn<(keyframes: Keyframe[], options: KeyframeAnimationOptions) => { currentTime: number }>> }
const fake = (): Fake => ({ animate: vi.fn(() => ({ currentTime: 0 })) })
const PART_NAMES = ['ghost', 'tile', 'ringA', 'ringB', 'digits', 'stamp', 'card'] as const
function parts() {
  const made = { ghost: fake(), tile: fake(), ringA: fake(), ringB: fake(), digits: fake(), stamp: fake(), card: fake() }
  return { made, asParts: made as unknown as Parameters<typeof countdownBurst>[0] }
}
const optionsOf = (made: ReturnType<typeof parts>['made']) => PART_NAMES.map(name => made[name].animate.mock.calls[0]![1])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('countdownBurst', () => {
  for (const [spelling, values] of [['milliseconds', MS_SPELLING], ['the minified seconds', SECONDS_SPELLING]] as const) {
    describe(`with the duration tokens in ${spelling}`, () => {
      it.each([0, 100])('plays the seven tracks sought to %i ms and says so', (elapsed) => {
        tokens(values)
        const { made, asParts } = parts()

        expect(countdownBurst(asParts, elapsed)).toBe(true)

        for (const name of PART_NAMES) expect(made[name].animate, name).toHaveBeenCalledTimes(1)
        const options = optionsOf(made)
        expect(options.map(o => o.delay)).toEqual([0, 0, 0, 160, 80, 200, 200])
        expect(options.map(o => o.duration)).toEqual([140, 360, 600, 600, 220, 360, 220])
        expect(options.map(o => o.fill)).toEqual(Array(7).fill('backwards'))
        for (const name of PART_NAMES) expect(made[name].animate.mock.results[0]!.value.currentTime, name).toBe(elapsed)
      })
    })
  }

  describe('the end of the burst', () => {
    it('seeks in at 759 ms and plays nothing from 760 ms on', () => {
      tokens(MS_SPELLING)

      const early = parts()
      expect(countdownBurst(early.asParts, 759)).toBe(true)
      expect(early.made.ringB.animate).toHaveBeenCalledTimes(1)

      for (const elapsed of [760, 800]) {
        const late = parts()
        expect(countdownBurst(late.asParts, elapsed), `${elapsed} ms`).toBe(false)
        for (const name of PART_NAMES) expect(late.made[name].animate, `${elapsed} ms ${name}`).not.toHaveBeenCalled()
      }
    })

    it('plays nothing for a time before zero', () => {
      tokens(MS_SPELLING)
      const { made, asParts } = parts()

      expect(countdownBurst(asParts, -1)).toBe(false)
      for (const name of PART_NAMES) expect(made[name].animate, name).not.toHaveBeenCalled()
    })

    it('follows the tokens, not a constant: a --cp-dur-slower of 1000 ms ends it at 1160 ms (ring B: 160 + 1000)', () => {
      tokens({ ...MS_SPELLING, '--cp-dur-slower': '1000ms' })

      const inside = parts()
      expect(countdownBurst(inside.asParts, 800)).toBe(true)
      expect(countdownBurst(parts().asParts, 1159)).toBe(true)
      expect(countdownBurst(parts().asParts, 1160)).toBe(false)
    })

    it('follows the tokens, not a constant: durations of 100 ms end it at 300 ms (the stamp and the card: 200 + 100)', () => {
      tokens({ '--cp-dur-fast': '100ms', '--cp-dur-base': '100ms', '--cp-dur-slow': '100ms', '--cp-dur-slower': '100ms' })

      expect(countdownBurst(parts().asParts, 299)).toBe(true)
      const outside = parts()
      expect(countdownBurst(outside.asParts, 300)).toBe(false)
      for (const name of PART_NAMES) expect(outside.made[name].animate, name).not.toHaveBeenCalled()
    })
  })

  it('plays nothing under reduced motion', () => {
    tokens(MS_SPELLING, 'reduced')
    const { made, asParts } = parts()

    expect(countdownBurst(asParts, 0)).toBe(false)
    for (const name of PART_NAMES) expect(made[name].animate, name).not.toHaveBeenCalled()
  })

  it('plays nothing, and says so, when no part can animate', () => {
    tokens(MS_SPELLING)
    const bare = Object.fromEntries(PART_NAMES.map(name => [name, {}])) as unknown as Parameters<typeof countdownBurst>[0]

    expect(countdownBurst(bare, 0)).toBe(false)
  })
})
