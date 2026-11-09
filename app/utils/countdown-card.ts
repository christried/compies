import { countdownState, remainingMsAt, type CountdownFacts } from '~~/shared/countdown'

// What the Countdown card shows at a time (#340, 13-countdown § CountdownCard). One pure function of the stored facts and the ticker's
// value: nothing here remembers when the viewer arrived, so a viewer who mounts at 7.4 s left gets the 7 row at once.

/** The tile's fill: calm (paper), running (primary), the warning of the first five of the last ten, the error of the last five and at zero. */
export type Tone = 'calm' | 'run' | 'warn' | 'err'

export interface CountdownFrame {
  view: 'ready' | 'running' | 'paused' | 'done'
  /** `ceil(max(0, left) / 1000)`; 0 when done. */
  s: number
  /** Running or paused, and 1 <= s <= 10. Never while ready, never at zero. */
  final: boolean
  /** `m:ss` with unpadded minutes, the bare seconds in the last ten, `0:00` when done. */
  text: string
  tone: Tone
  digitFg: 'on' | 'ink' | 'warning-fg' | 'error-fg'
  /** `1 + (10 - s) * 0.035` in the last ten, else 1. */
  scale: number
  /** Lit pips 0..10 while final or done (done: 0); null while the bar shows. */
  pips: number | null
  /** The bar's width, 0..1: the share left while running or paused, 1 while ready. */
  fill: number
}

/** The last ten seconds: seconds only, the tone, the scale and the pips switch on (04-motion § Countdown). */
const FINAL_FROM_S = 10
/** The warning tone holds down to this second, then the error tone. */
const WARNING_UNTIL_S = 6
const SCALE_STEP = 0.035

/** Seconds as `m:ss`, unpadded minutes: the card's time and the `{time}` of its lines. */
export const countdownClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function countdownFrame(c: CountdownFacts, atMs: number): CountdownFrame {
  const state = countdownState(c, atMs)
  const left = state === 'ended' ? 0 : remainingMsAt(c, atMs)
  const s = Math.ceil(Math.max(0, left) / 1000)

  if (state === 'ended') return { view: 'done', s: 0, final: false, text: '0:00', tone: 'err', digitFg: 'on', scale: 1, pips: 0, fill: 0 }

  const view = state
  const final = view !== 'ready' && s >= 1 && s <= FINAL_FROM_S
  const fill = view === 'ready' ? 1 : left / c.durationMs

  if (!final) {
    return { view, s, final, text: countdownClock(s), tone: view === 'running' ? 'run' : 'calm', digitFg: view === 'running' ? 'on' : 'ink', scale: 1, pips: null, fill }
  }
  const warning = s >= WARNING_UNTIL_S
  return {
    view,
    s,
    final,
    text: String(s),
    // Paused in the last ten has no fill and no pulse: the tile stays paper and the digits carry the colour.
    tone: view === 'paused' ? 'calm' : warning ? 'warn' : 'err',
    digitFg: view === 'paused' ? (warning ? 'warning-fg' : 'error-fg') : 'on',
    scale: 1 + (FINAL_FROM_S - s) * SCALE_STEP,
    pips: s,
    fill,
  }
}

/**
 * A length in words for the screen reader: „3 Minuten 45 Sekunden“, „1 Minute“, „7 Sekunden“; a zero part is left out, a zero length reads
 * „0 Sekunden“. `t` reads the two plural keys (`countdown.nMinutes`, `countdown.nSeconds`).
 */
export function durationWords(totalSeconds: number, t: (key: 'countdown.nMinutes' | 'countdown.nSeconds', n: number) => string): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (minutes > 0) parts.push(t('countdown.nMinutes', minutes))
  if (seconds > 0 || minutes === 0) parts.push(t('countdown.nSeconds', seconds))
  return parts.join(' ')
}
