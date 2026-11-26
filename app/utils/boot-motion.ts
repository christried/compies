import type { RigState } from './compibert-rig'
import type { Gsap } from './gsap'
import { motionMs } from './motion'

// The splash's run-in (#674, spec #927, 04-motion § Boot „Reinsprinten“ (3b), reference `SC['3b']`): Compibert runs in from the left, the letters of
// COMPIES spring up behind his snout, he skids with dust and waves, and the layer fades out. Client only: it works on elements.

/** The run's length, in seconds: the reference's T. */
export const BOOT_RUN_S = 0.9
/** The calm splash holds its still frame this long, counted from the mount, before it fades away. */
export const HOLD_MS = 600
/** The run-in starts only if GSAP and the rig are ready this soon after the mount: a slow phone gets no run, and no retry. */
export const GIVE_UP_MS = 400
/** The reference starts him 620 px left for a 160 px figure; the splash starts him at least that far, and outside the viewport on a wide one. */
const MIN_DISTANCE = 620
/** His snout is at 0.9 of his width. */
const SNOUT_AT = 0.9

const clamp = (min: number, max: number, value: number) => Math.min(max, Math.max(min, value))

/**
 * The second each letter springs up (the Lab's rule: when his snout passes the letter's centre). `snoutStartX` is where the snout starts, `distance` the
 * way he runs; a letter left of the start is at 0, and one right of the snout's final place at the run's end (the upper clamp is new: here the
 * figure stands at the word's right end, so the Lab's word, which lay left of him, never needed it).
 */
export function letterTimes(centres: number[], snoutStartX: number, distance: number, run: number): number[] {
  return centres.map(centre => clamp(0, run, (centre - snoutStartX) / distance * run))
}

/**
 * How far he runs and when each letter springs up. All in the layer's coordinates, measured before the start poses are set: the wrapper's left and
 * width, the letters' centres. The distance makes him start outside the viewport whatever its width (the reference's constant 620 only fits a phone).
 */
export function bootRun({ wrapperLeft, wrapperWidth, centres }: { wrapperLeft: number, wrapperWidth: number, centres: number[] }): { distance: number, times: number[] } {
  const distance = Math.max(MIN_DISTANCE, wrapperLeft + wrapperWidth)
  const snoutStartX = wrapperLeft + wrapperWidth * SNOUT_AT - distance
  return { distance, times: letterTimes(centres, snoutStartX, distance, BOOT_RUN_S) }
}

/** The DOM parts the run moves: `BootSplash.vue`'s `data-part` hooks. */
export interface BootParts {
  /** The layer: it fades out at the end. */
  layer: HTMLElement
  /** The figure's wrapper: it runs in and skids. */
  wrap: HTMLElement
  letters: HTMLElement[]
  lines: HTMLElement[]
  dust: HTMLElement[]
}

/**
 * The run-in as one paused GSAP timeline (ADR 0015), the numbers of 04-motion § Boot and `SC['3b']`: the eases are GSAP's names (CODING_STANDARDS
 * § Motion; `boot-motion-tweens.test.ts` reads them off the timeline). Building it sets the start poses, a cut from the still frame the first byte
 * showed. `setState` is the rig's `state`; `onDone` fires when the fade has ended, which `progress(1)` (a tap or a key) reaches at once.
 */
export function bootTimeline(
  gsap: Gsap,
  parts: BootParts,
  { distance, times, setState, onDone }: { distance: number, times: number[], setState: (state: RigState) => void, onDone: () => void },
) {
  const T = BOOT_RUN_S
  // The fade's own length is the token, so the splash ends as the app's other layers do.
  const fade = motionMs('--cp-dur-base', '220ms') / 1000
  gsap.set(parts.wrap, { x: -distance })
  gsap.set(parts.letters, { y: 46, opacity: 0, scaleY: 0.3, transformOrigin: '50% 100%' })
  gsap.set(parts.lines, { opacity: 0, scaleX: 0.4, transformOrigin: '100% 50%' })
  gsap.set(parts.dust, { opacity: 0 })

  const timeline = gsap.timeline({ paused: true, onComplete: onDone })
  timeline.addLabel('run', 0).addLabel('skid', T).addLabel('wave', T + 0.5).addLabel('fade', T + 0.5 + 0.3)
  timeline
    .call(() => setState('run'), undefined, 'run')
    .to(parts.lines, { opacity: 1, scaleX: 1, duration: 0.2, stagger: 0.05 }, 'run')
    .to(parts.wrap, { x: 0, duration: T, ease: 'none' }, 'run')
  parts.letters.forEach((letter, index) => {
    timeline.to(letter, { y: 0, opacity: 1, scaleY: 1, duration: 0.45, ease: 'back.out(3)' }, times[index] ?? 0)
  })
  timeline
    .to(parts.lines, { opacity: 0, duration: 0.15 }, T - 0.05)
    .call(() => setState('idle'), undefined, 'skid')
    .to(parts.wrap, { x: 16, duration: 0.16, ease: 'power2.out' }, 'skid')
    .to(parts.wrap, { x: 0, duration: 0.3, ease: 'back.out(3)' }, T + 0.16)
    // `immediateRender: false`: a fromTo in a timeline would otherwise show its first frame at once, long before the skid.
    .fromTo(
      parts.dust,
      { opacity: 1, scale: 0.3, x: 0, y: 0 },
      { opacity: 0, scale: 1.7, x: (index: number) => -18 - index * 16, y: (index: number) => -4 - index * 5, duration: 0.65, stagger: 0.04, ease: 'power2.out', immediateRender: false },
      'skid',
    )
    .call(() => setState('wave'), undefined, 'wave')
    .to(parts.layer, { opacity: 0, duration: fade, ease: 'none' }, 'fade')
  return timeline
}
