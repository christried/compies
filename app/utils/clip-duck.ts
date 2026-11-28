import type { CueId } from './cue-ids'
import { CUE_LENGTHS } from './cue-lengths'

// The Clip gets quieter under the cues that sound over it (#670, spec #927; the decisions are in docs/research/clip-platforms-and-ducking.md § 5):
// while an Emote or the own Party's Veto seal sounds, the YouTube player's volume goes down, and it comes back after the last of them ended. Plain
// TypeScript, no Vue and no DOM: the cue player tells `note` which cue sounds (`onSounding`), the Clip overlay hands `attach` the player's
// `setVolume`. The duck sets the volume only: it never mutes or unmutes, so a muted Clip stays muted and a blocked phone's tap unmutes into
// the lowered volume. It lives on the page's one duck, so it is local to the device and sends nothing.

// The tunables, all of them, and nowhere else: a tuning by ear edits these lines only.
/** The Clip's normal volume: YouTube's default, which nothing else in the app sets. */
export const CLIP_VOLUME = 100
/** The volume while a ducking cue sounds: a starting value, about -6 dB (the scale's curve is undocumented). */
export const DUCK_VOLUME = 50
/** From the normal volume to `DUCK_VOLUME`, counted from the cue's start with no lead-in. */
export const DUCK_DOWN_MS = 100
/** From `DUCK_VOLUME` back to the normal volume, counted from the end of the last ducking cue. */
export const DUCK_UP_MS = 400
/** One `setVolume` call per step. */
export const DUCK_STEP_MS = 25

/** The cues that duck: the own Party's Veto seal and every Emote's. The stop's cues come from plans and never duck. A test checks that no `emo-*` cue is missing. */
export const DUCKING_CUES: ReadonlySet<CueId> = new Set<CueId>(['veto-seal', 'emo-clap', 'emo-haha', 'emo-grr', 'emo-roar'])

/** What a duck reads of the tunables; every function takes it as an optional last argument. */
export interface DuckConfig {
  duckVolume: number
  downMs: number
  upMs: number
  /** The pace of the timer; `DUCK_STEP_MS` when absent. Only `createClipDuck` reads it. */
  stepMs?: number
}

const DEFAULT_DUCK_CONFIG: DuckConfig = { duckVolume: DUCK_VOLUME, downMs: DUCK_DOWN_MS, upMs: DUCK_UP_MS }

/** A cue's time on the page's clock (`performance.now`), from its start to its end (outside). */
interface Sounding { startMs: number, endMs: number }

/** Whether any cue sounds at `nowMs`: `start <= now < end`. */
export function duckHeld(sounds: readonly Sounding[], nowMs: number): boolean {
  return sounds.some(sound => sound.startMs <= nowMs && nowMs < sound.endMs)
}

/**
 * The level after `dtMs`: it moves in a straight line towards the duck volume while held and towards the normal volume while not, at the rate
 * of the whole span over `downMs` or `upMs`, and never past the target. A duck during the rise goes down from where the level is.
 */
export function duckStep(level: number, held: boolean, dtMs: number, config: DuckConfig = DEFAULT_DUCK_CONFIG): number {
  const span = CLIP_VOLUME - config.duckVolume
  if (held) return Math.max(config.duckVolume, level - (span / config.downMs) * dtMs)
  return Math.min(CLIP_VOLUME, level + (span / config.upMs) * dtMs)
}

export interface ClipDuck {
  /** A cue starts `delayMs` from now; ids that do not duck are ignored. */
  note: (cue: { id: CueId, delayMs: number }) => void
  /**
   * The Clip overlay's setter. The sink gets the current volume at once (the normal one at rest too: the IFrame player can keep a volume set in
   * an earlier visit, and a player made during a duck starts lowered). One sink at a time: a new attach replaces the old. Returns the detach.
   */
  attach: (sink: (volume: number) => void) => () => void
  /** The level now, a float between the duck volume and `CLIP_VOLUME`. */
  readonly level: number
  /** Stops the timer and lets go of the sink. */
  dispose: () => void
}

export function createClipDuck(options: { config?: DuckConfig, now?: () => number } = {}): ClipDuck {
  const config = options.config ?? DEFAULT_DUCK_CONFIG
  const now = options.now ?? (() => performance.now())
  let level = CLIP_VOLUME
  let sounds: Sounding[] = []
  let sink: ((volume: number) => void) | null = null
  /** The last whole number the sink was given, so a tick that moves the level by less than one gives it nothing. */
  let sent = CLIP_VOLUME
  let timer: ReturnType<typeof setInterval> | null = null
  let lastTick = 0

  function stop() {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  function tick() {
    const at = now()
    sounds = sounds.filter(sound => sound.endMs > at)
    level = duckStep(level, duckHeld(sounds, at), at - lastTick, config)
    lastTick = at
    const rounded = Math.round(level)
    if (rounded !== sent) {
      sent = rounded
      sink?.(rounded)
    }
    if (sounds.length === 0 && level === CLIP_VOLUME) stop()
  }

  return {
    note(cue) {
      if (!DUCKING_CUES.has(cue.id)) return
      const startMs = now() + cue.delayMs
      sounds.push({ startMs, endMs: startMs + CUE_LENGTHS[cue.id].ms })
      if (timer !== null) return
      lastTick = now()
      timer = setInterval(tick, config.stepMs ?? DUCK_STEP_MS)
    },
    attach(next) {
      sink = next
      sent = Math.round(level)
      next(sent)
      return () => {
        if (sink === next) sink = null
      }
    },
    get level() {
      return level
    },
    dispose() {
      stop()
      sounds = []
      sink = null
    },
  }
}
