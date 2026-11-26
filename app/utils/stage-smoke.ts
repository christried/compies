import type { EventView } from '~~/shared/event'
import { msOf } from '~~/shared/instant'
import { REMOVE_AFTER_MS } from './wheel'

// The stage smoke's plan (#675, note 19-rauch-auf-der-buehne): how fast it drifts, and the five shapes it is made of. Like the sound cues
// (`sound-cues.ts`) it is a pure function of the viewer's own Event read: no clock in here, so a late joiner or a reload lands in the same
// rate (ADR 0013). It reads instants only, never a game, a label, a side or a cast (§ Secrecy has no surface here).

/** One stretch of server time (epoch ms) in which the smoke runs at half speed; the start is in, the end is out. */
export interface SmokeWindow { from: number, to: number }

/** The Veto reveal runs 1.2 s from the end of the window (note 19 § Moments). */
const VETO_REVEAL_MS = 1200

/** Lucky Wheel spin, Veto reveal, coin flip and Award ceremony, from the read the page already has; what is null gives no window. */
export function smokeWindows(view: Pick<EventView, 'wheel' | 'coin' | 'ceremony'>): SmokeWindow[] {
  const windows: SmokeWindow[] = []
  const { wheel, coin, ceremony } = view
  // After the stop the Veto window opens; the spin's moment ends with its last bulb, the wheel's own 2.2 s later (note 19 § Moments).
  if (wheel?.spin) windows.push({ from: msOf(wheel.spin.spinStartAt), to: msOf(wheel.spin.stopAt) + REMOVE_AFTER_MS })
  const vetoEndsAt = wheel?.vetoes.draw?.vetoEndsAt
  if (vetoEndsAt) windows.push({ from: msOf(vetoEndsAt), to: msOf(vetoEndsAt) + VETO_REVEAL_MS })
  if (coin) windows.push({ from: msOf(coin.startedAt), to: msOf(coin.landsAt) })
  if (ceremony) windows.push({ from: msOf(ceremony.startsAt), to: msOf(ceremony.endsAt) })
  return windows
}

/** The playback rate of the smoke's animations at `now`: half speed inside any window, normal speed everywhere else. */
export function smokeRate(windows: SmokeWindow[], now: number): 0.5 | 1 {
  return windows.some(w => w.from <= now && now < w.to) ? 0.5 : 1
}

/** The next instant after `now` at which the rate may change, or null when none is left. */
export function smokeNextEdge(windows: SmokeWindow[], now: number): number | null {
  let next: number | null = null
  for (const w of windows) {
    for (const edge of [w.from, w.to]) {
      if (edge > now && (next === null || edge < next)) next = edge
    }
  }
  return next
}

/** A shape's place on the layer, in percent of it: left, top, width and height. */
export interface SmokeBox { x: number, y: number, w: number, h: number }

export interface SmokeShape {
  /** From md up (the artboard's 1440). */
  wide: SmokeBox
  /** Below md (the artboard's 390). */
  narrow: SmokeBox
  /** The colour token in Hell and in Dunkel (`--cp-<name>`). */
  hell: 'pop' | 'mint' | 'primary'
  dunkel: 'hot' | 'cobalt'
  keyframes: 'cp-smoke-rise-a' | 'cp-smoke-rise-b'
  /** One leg of the alternating drift; the loop there and back is twice that. */
  legSeconds: number
  /** Negative: the shapes start spread over their loops, not together. */
  delaySeconds: number
}

/** `SH.B` of `BuehnenRauch.dc.html`, the approved option 1b „Aufsteigend“; leg = loop / 2 with loops 36 + 8i s, delay = -9i s. */
export const SMOKE_SHAPES: readonly SmokeShape[] = [
  { wide: { x: 4, y: -16, w: 46, h: 60 }, narrow: { x: -34, y: -14, w: 110, h: 46 }, hell: 'pop', dunkel: 'hot', keyframes: 'cp-smoke-rise-a', legSeconds: 18, delaySeconds: 0 },
  { wide: { x: 36, y: -22, w: 42, h: 58 }, narrow: { x: 22, y: 0, w: 110, h: 44 }, hell: 'mint', dunkel: 'cobalt', keyframes: 'cp-smoke-rise-b', legSeconds: 22, delaySeconds: -9 },
  { wide: { x: 58, y: 0, w: 46, h: 62 }, narrow: { x: -22, y: 26, w: 120, h: 44 }, hell: 'primary', dunkel: 'hot', keyframes: 'cp-smoke-rise-a', legSeconds: 26, delaySeconds: -18 },
  { wide: { x: 20, y: 30, w: 48, h: 56 }, narrow: { x: 12, y: 48, w: 110, h: 40 }, hell: 'mint', dunkel: 'cobalt', keyframes: 'cp-smoke-rise-b', legSeconds: 30, delaySeconds: -27 },
  { wide: { x: -6, y: 48, w: 40, h: 50 }, narrow: { x: -40, y: 66, w: 120, h: 38 }, hell: 'primary', dunkel: 'hot', keyframes: 'cp-smoke-rise-a', legSeconds: 34, delaySeconds: -36 },
]
