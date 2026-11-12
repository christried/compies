import type { SpinView } from '~~/shared/stage'
import { msOf } from '~~/shared/instant'
import { REVEAL_AFTER_MS, removalStart } from './wheel'
import { pinCrossings } from './wheel-pins'

// Which sound cue is due at which server time (#530, spec #504 § The cue plan): a pure function of the viewer's own Event read, so every
// device, a late joiner included, holds the same plan (ADR 0013). Nothing here plays or knows a clock: the cue player (#531) schedules what
// `wheelCuePlan` returns, skips a cue that is too late and never works a time out itself. The Veto window's plan joins in #532.

/** The eleven cue ids of 0.13.3 (#504), = the cue id of `compibert-sound.md` and the file name in the sound folder. */
export const CUE_IDS = [
  'wheel-windup', 'wheel-tick', 'wheel-stop', 'wheel-morph', 'wheel-slice-out',
  'veto-open', 'veto-clock', 'veto-clip-close', 'veto-seal', 'veto-drumroll', 'veto-reveal',
] as const
export type CueId = (typeof CUE_IDS)[number]

/** `Vol` of `reference/docs/compibert-sound.md`, 0 to 100, relative to the loudest cue (the fanfare = 100); the player's gain is Vol / 100. */
export const CUE_VOLUME: Record<CueId, number> = {
  'wheel-windup': 45, 'wheel-tick': 30, 'wheel-stop': 70, 'wheel-morph': 50, 'wheel-slice-out': 35,
  'veto-open': 50, 'veto-clock': 25, 'veto-clip-close': 35, 'veto-seal': 55, 'veto-drumroll': 60, 'veto-reveal': 85,
}

/** One cue of a plan: which, and when (server time, epoch ms). Its volume is `CUE_VOLUME[id]`, not a field: the plan holds only what a time decides. */
export interface Cue { id: CueId, at: number }

/** What the plan reads: the viewer's own Event read and the viewer's reduced-motion setting, nothing of the draw's game (§ Secrecy). */
export interface WheelCueInput {
  /**
   * `view.wheel.spin`, only the five fields that locate the spin: null before the first spin gives no cues. The five are what the Event read
   * sends every viewer from the spin's commit on; the draw's game (`game`, `labels`) stays out of the type, so it cannot be read by mistake.
   */
  spin: Pick<SpinView, 'spinStartAt' | 'stopAt' | 'slices' | 'resultIndex' | 'resultOffset'> | null
  /** The Event's Hidden wheel setting, `view.settings?.hiddenWheel ?? false`. It delays the removal for every viewer. */
  hiddenWheel: boolean
  /** `view.event.isHost`: the Host sees the real names under a Hidden wheel and has no morph (LuckyWheel `concealed = hidden && !isHost`). */
  isHost: boolean
  /** `reducedMotion()` of `app/utils/motion.ts`, passed in: this module reads no DOM. */
  reducedMotion: boolean
}

/**
 * Two ticks closer than this overlap and smear into a buzz: the tick sample is 30 ms long (`compibert-sound.md`), so 40 ms leaves ten
 * milliseconds of gap and 25 ticks a second at most. A placeholder for the listening session (#535), where it is tuned by ear; the one
 * constant, nothing else knows it. The flapper keeps kicking at every crossing: the cap thins the sound only.
 *
 * @public no production caller until the cue player (#531; knip: same wording as shared/draw-timeline.ts)
 */
export const TICK_MIN_GAP_MS = 40

/**
 * Greedy thinning of ascending times: the first is kept, then each time that is at least `minGapMs` after the last KEPT one (a gap of exactly
 * the cap keeps). The crossings' gaps widen toward the stop, so the late ticks always survive and the last tick is the last crossing.
 *
 * @public no production caller until the cue player (#531; knip: same wording as shared/draw-timeline.ts)
 */
export function thinTicks(at: readonly number[], minGapMs: number): number[] {
  const kept: number[] = []
  for (const time of at) {
    if (kept.length === 0 || time - kept[kept.length - 1]! >= minGapMs) kept.push(time)
  }
  return kept
}

/**
 * The cues of a spin, ascending by `at`: wind-up at the start, a tick at each pin crossing (capped), the stop, for a Member under a Hidden
 * wheel the morph at the reveal, and the slice leaving at the removal. Reduced motion leaves out the wind-up and the ticks, as the spin
 * itself is then a calm turn that ends at the same stop. It has no `now` and drops nothing for being past: the player skips a late cue.
 *
 * The crossings come from `pinCrossings`, the one place they are worked out. The morph's presence depends on `hiddenWheel` and `isHost`
 * only, and the slice leaves later on a Hidden wheel for every viewer (the reveal must come first), so the devices stay in step. Nothing here
 * depends on the drawn game, so no cue's presence or time before the stop does either.
 *
 * @public no production caller until the cue player (#531; knip: same wording as shared/draw-timeline.ts)
 */
export function wheelCuePlan(input: WheelCueInput): Cue[] {
  const { spin, hiddenWheel, isHost, reducedMotion } = input
  if (spin === null) return []

  const start = msOf(spin.spinStartAt)
  const stop = msOf(spin.stopAt)
  const cues: Cue[] = []

  if (!reducedMotion) {
    cues.push({ id: 'wheel-windup', at: start })
    const crossings = pinCrossings({ spinStartAt: start, stopAt: stop, slices: spin.slices, resultIndex: spin.resultIndex, resultOffset: spin.resultOffset })
    for (const at of thinTicks(crossings.map(crossing => crossing.at), TICK_MIN_GAP_MS)) cues.push({ id: 'wheel-tick', at })
  }
  cues.push({ id: 'wheel-stop', at: stop })
  if (hiddenWheel && !isHost) cues.push({ id: 'wheel-morph', at: stop + REVEAL_AFTER_MS })
  cues.push({ id: 'wheel-slice-out', at: removalStart({ stopAt: stop }, hiddenWheel) })
  return cues
}
