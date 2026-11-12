import { stopReached } from '~~/shared/draw-timeline'
import type { WheelTiming } from './wheel'
import { BULB_COUNT } from './wheel-look'

// Which of the 24 bulbs are lit at a server time (#521, spec #503 § The motion, 04-motion § Lucky Wheel). A pure function of the spin's
// two instants and the server's clock: the same on every device, a late joiner included, and nothing here reads a clock or a game, so
// a Hidden wheel's Member and the Host get the same bulbs. This is the one place the pattern is worked out.

/** At rest the even and the odd bulbs take turns every 0.6 s (04-motion; the reference's own 0.72 s loses to the ticket). */
const REST_MS = 600
/** While the wheel turns every fourth bulb is lit and the set moves one bulb toward the lower indexes every 0.08 s (the reference's `(i + step) % 4`). */
const CHASE_STEP_MS = 80
const CHASE_EVERY = 4
/** At the stop all bulbs flash: lit 0.12 s, dark 0.12 s, three times, starting lit (the user may read „three flashes of 0.12 s“ as 0.36 s in all: one number here). */
const FLASH_MS = 120
const FLASH_COUNT = 3
const FLASH_TOTAL_MS = FLASH_MS * FLASH_COUNT * 2

const lights = (lit: (index: number) => boolean): boolean[] => Array.from({ length: BULB_COUNT }, (_, index) => lit(index))

/**
 * The bulbs, index 0 at the top and clockwise (`bulbPoints()`), at `nowMs`, the server's time of this frame (null before the page has
 * mounted: the even bulbs, as the server's render has them). `spin` is null when no Draw is on the wheel. Reduced motion lights all
 * 24 steadily. First match wins: the flash from the stop for 0.72 s, the chase from the spin's start until the stop, else the rest blink,
 * anchored at the epoch of the server's time so that it also runs through the lead and long after the spin.
 */
export function bulbsLit(spin: Pick<WheelTiming, 'spinStartAt' | 'stopAt'> | null, nowMs: number | null, reduced: boolean): boolean[] {
  if (reduced) return lights(() => true)
  if (nowMs === null) return lights(index => index % 2 === 0)
  if (spin) {
    const stopped = stopReached(spin, nowMs)
    if (stopped && nowMs - spin.stopAt < FLASH_TOTAL_MS) {
      const lit = Math.floor((nowMs - spin.stopAt) / FLASH_MS) % 2 === 0
      return lights(() => lit)
    }
    if (!stopped && nowMs >= spin.spinStartAt) {
      const step = Math.floor((nowMs - spin.spinStartAt) / CHASE_STEP_MS)
      return lights(index => (index + step) % CHASE_EVERY === 0)
    }
  }
  const phase = Math.floor(nowMs / REST_MS) % 2
  return lights(index => index % 2 === phase)
}

/**
 * The server time (epoch ms) strictly after `nowMs` at which `bulbsLit` may next show another set (#584 Q1): the bulbs' ticker sleeps until
 * then instead of reading every frame. It follows `bulbsLit`'s order and numbers: the flash's next step, the chase's next step or the stop,
 * the spin's start during the lead, else the rest blink's next boundary. Like `bulbsLit` it takes no slices and no game. Reduced motion needs
 * no answer: its bulbs are steady and its ticker does not run.
 */
export function nextBulbChange(spin: Pick<WheelTiming, 'spinStartAt' | 'stopAt'> | null, nowMs: number): number {
  const restChange = (Math.floor(nowMs / REST_MS) + 1) * REST_MS
  if (spin) {
    const stopped = stopReached(spin, nowMs)
    if (stopped && nowMs - spin.stopAt < FLASH_TOTAL_MS) return spin.stopAt + (Math.floor((nowMs - spin.stopAt) / FLASH_MS) + 1) * FLASH_MS
    if (!stopped && nowMs >= spin.spinStartAt) return Math.min(spin.spinStartAt + (Math.floor((nowMs - spin.spinStartAt) / CHASE_STEP_MS) + 1) * CHASE_STEP_MS, spin.stopAt)
    if (!stopped) return Math.min(restChange, spin.spinStartAt)
  }
  return restChange
}
