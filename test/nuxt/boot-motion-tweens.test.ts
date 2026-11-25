import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RigState } from '~/utils/compibert-rig'
import { bootTimeline } from '~/utils/boot-motion'
import { loadGsap } from '~/utils/gsap'

// The splash's run-in (#674, spec #927; 04-motion § Boot „Reinsprinten“ (3b)): the tweens of the built timeline carry the named eases, durations and
// positions of the reference (`SC['3b']`). GSAP's eases are not `--cp-ease-*` tokens, so the test reads the tween vars off the timeline, as
// ceremony-run-tweens.test.ts does, and what is not a plain var (the dust's per-target values) off the targets once the timeline has run.

interface Tween { targets: () => unknown[], startTime: () => number, vars: { ease?: unknown, duration?: number, stagger?: unknown, x?: unknown, opacity?: unknown } }

const TIMES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]
const DISTANCE = 620

/** The layer's `data-part` hooks as `BootSplash.vue` renders them. */
function parts() {
  const layer = document.createElement('div')
  layer.dataset.part = 'boot-splash'
  const add = (name: string, count = 1) => Array.from({ length: count }, () => {
    const element = document.createElement('div')
    element.dataset.part = name
    layer.append(element)
    return element
  })
  const [wrap] = add('boot-wrap')
  return { layer, wrap: wrap!, letters: add('boot-letter', 7), lines: add('boot-line', 3), dust: add('boot-dust', 4) }
}

async function build(onDone = () => {}, states: RigState[] = []) {
  const gsap = await loadGsap()
  const shown = parts()
  document.body.append(shown.layer)
  // Boxed: a GSAP timeline has a `then`, so awaiting one would wait for the animation to play.
  return { gsap, shown, timeline: bootTimeline(gsap, shown, { distance: DISTANCE, times: TIMES, setState: state => states.push(state), onDone }), states }
}

const tweensOf = (timeline: { getChildren: (...flags: boolean[]) => unknown[] }) => (timeline.getChildren(false, true, false) as Tween[])
  .filter(tween => tween.targets().length > 0 && tween.targets().every(target => target instanceof HTMLElement))
  .map(tween => ({
    part: (tween.targets()[0] as HTMLElement).dataset.part!,
    start: tween.startTime(),
    ease: typeof tween.vars.ease === 'string' ? tween.vars.ease : undefined,
    duration: tween.vars.duration!,
    stagger: typeof tween.vars.stagger === 'number' ? tween.vars.stagger : undefined,
    vars: tween.vars,
    targets: tween.targets() as HTMLElement[],
  }))

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.style.removeProperty('--cp-dur-base')
})

describe('the run-in\'s labels', () => {
  it('are run at 0, skid at 0.9, wave at 1.4 and fade at 1.7', async () => {
    const { timeline } = await build()

    expect(timeline.labels).toMatchObject({ run: 0, skid: 0.9, wave: 1.4, fade: 1.7 })
  })
})

describe('the run-in\'s start poses', () => {
  it('has the letters down and invisible, the wrapper off to the left and the lines and dust hidden', async () => {
    const { gsap, shown } = await build()

    for (const letter of shown.letters) expect([gsap.getProperty(letter, 'y'), gsap.getProperty(letter, 'opacity')]).toEqual([46, 0])
    expect(gsap.getProperty(shown.wrap, 'x')).toBe(-DISTANCE)
    for (const element of [...shown.lines, ...shown.dust]) expect(gsap.getProperty(element, 'opacity')).toBe(0)
  })

  it('does not play until it is told to', async () => {
    const { timeline } = await build()

    expect(timeline.paused()).toBe(true)
  })
})

describe('the run-in\'s tweens (04-motion § Boot)', () => {
  it('runs the wrapper in from the left, linear, in 0.9 s from the start', async () => {
    const { timeline } = await build()

    const run = tweensOf(timeline).find(tween => tween.part === 'boot-wrap' && tween.ease === 'none')!
    expect([run.start, run.duration, run.vars.x]).toEqual([0, 0.9, 0])
  })

  it('brings the speed lines in at 0 in 0.2 s, 0.05 apart, and out at 0.85 in 0.15 s', async () => {
    const seen = tweensOf((await build()).timeline).filter(tween => tween.part === 'boot-line')

    expect(seen.find(tween => tween.vars.opacity === 1)).toMatchObject({ start: 0, duration: 0.2, stagger: 0.05 })
    expect(seen.find(tween => tween.vars.opacity === 0)).toMatchObject({ start: 0.85, duration: 0.15 })
  })

  it('springs each letter up in 0.45 s, back.out(3), at its own time', async () => {
    const seen = tweensOf((await build()).timeline).filter(tween => tween.part === 'boot-letter')

    expect(seen).toHaveLength(7)
    expect(seen.map(tween => [tween.ease, tween.duration, tween.start])).toEqual(TIMES.map(time => ['back.out(3)', 0.45, time]))
  })

  it('skids by 16 px in 0.16 s, power2.out, and settles in 0.3 s, back.out(3), 0.16 s later', async () => {
    const seen = tweensOf((await build()).timeline).filter(tween => tween.part === 'boot-wrap' && tween.ease !== 'none')

    expect(seen.map(tween => [tween.ease, tween.duration, tween.vars.x, Math.round(tween.start * 100) / 100])).toEqual([
      ['power2.out', 0.16, 16, 0.9],
      ['back.out(3)', 0.3, 0, 1.06],
    ])
  })

  it('lets the dust fly in 0.65 s, 0.04 apart, power2.out, from the skid', async () => {
    const dust = tweensOf((await build()).timeline).filter(tween => tween.part === 'boot-dust')

    expect(dust).toHaveLength(1)
    expect(dust[0]).toMatchObject({ ease: 'power2.out', duration: 0.65, stagger: 0.04, start: 0.9 })
    expect(dust[0]!.targets).toHaveLength(4)
  })

  it('has each puff end at x −18 − i·16 and y −4 − i·5, grown to 1.7 and gone', async () => {
    const { gsap, timeline, shown } = await build()

    timeline.progress(1)

    expect(shown.dust.map(puff => [gsap.getProperty(puff, 'x'), gsap.getProperty(puff, 'y'), gsap.getProperty(puff, 'scale'), gsap.getProperty(puff, 'opacity')])).toEqual([
      [-18, -4, 1.7, 0],
      [-34, -9, 1.7, 0],
      [-50, -14, 1.7, 0],
      [-66, -19, 1.7, 0],
    ])
  })

  it('shows no puff before the skid', async () => {
    const { gsap, timeline, shown } = await build()

    timeline.time(0.5)

    for (const puff of shown.dust) expect(gsap.getProperty(puff, 'opacity')).toBe(0)
  })

  it('fades the layer out from 1.7 s over the duration token, linear', async () => {
    document.documentElement.style.setProperty('--cp-dur-base', '300ms')
    const fade = tweensOf((await build()).timeline).find(tween => tween.part === 'boot-splash')

    expect(fade).toMatchObject({ ease: 'none', start: 1.7 })
    expect(fade!.duration).toBeCloseTo(0.3, 10)
  })
})

describe('skipping the run-in (progress(1))', () => {
  it('calls the rig\'s states in order, run, idle, wave', async () => {
    const { timeline, states } = await build()

    timeline.progress(1)

    expect(states).toEqual(['run', 'idle', 'wave'])
  })

  it('ends with the layer gone and reports it done once', async () => {
    const done = vi.fn()
    const { timeline, shown } = await build(done)

    timeline.progress(1)

    expect(shown.layer.style.opacity).toBe('0')
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('has the letters up and the wrapper in its place', async () => {
    const { gsap, timeline, shown } = await build()

    timeline.progress(1)

    for (const letter of shown.letters) expect([gsap.getProperty(letter, 'y'), gsap.getProperty(letter, 'opacity')]).toEqual([0, 1])
    expect(gsap.getProperty(shown.wrap, 'x')).toBe(0)
  })
})
