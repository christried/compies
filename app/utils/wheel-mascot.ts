import type { RigState } from './compibert-rig'
import { removalStart, type WheelTiming } from './wheel'

// Compibert at the wheel (#526, spec #503, hand-off note 16-compibert-gluecksrad.md): where he is in a spin and where his box stands. Pure, no Vue and
// no GSAP: his state is a function of the spin's two instants and the server's time, so every device, a late joiner and a returning tab
// included, shows him in the same state at the same time (ADR 0013, no timer decides). The spin's length is 6 to 10 s (#520), so the brake
// is a share of it, never a constant. What he is told is the two instants, whether the wheel is hidden and whether motion is reduced:
// never a slice, a label or the result (CODING_STANDARDS § Secrecy), so no draw changes where he stands or what he does.

/** What he needs of a spin: its instants (epoch ms), the same two the wheel's own timing has. */
export type MascotSpin = Pick<WheelTiming, 'spinStartAt' | 'stopAt'>
export type MascotWidth = 'md' | 'sm'
/** `in`: coming up behind the wheel (or fading in); `on`: there; `out`: on his way back (or fading out) with the drawn slice. */
export type MascotStage = 'in' | 'on' | 'out'

/** The travel in and the fade, full motion; the way out lasts as long as the tween of the same name. */
const ENTER_MS = 450
const LEAVE_MS = 400
/** Reduced motion fades in place for this long, in and out (`dur-base`). */
const FADE_REDUCED_MS = 220
/** The brake is at this share of the spin's length (04-motion: `0.6·D`), as a fraction of 5 so the integer instants stay exact. */
const BRAKE_FIFTHS = 3
/** He cheers for this long, then is idle until he leaves. */
const CHEER_MS = 1600
/** Under a Hidden wheel he holds his breath until the drawn label turns into the game (`revealStage`'s half second) and cheers then. */
const HIDDEN_CHEER_AFTER_MS = 500

/** The server instants (epoch ms) at which he changes, for a spin. */
export function mascotMoments(spin: MascotSpin, hidden: boolean, reduced: boolean) {
  const { spinStartAt, stopAt } = spin
  const cheerAt = stopAt + (hidden ? HIDDEN_CHEER_AFTER_MS : 0)
  // He leaves with the drawn slice: the same instant, so a change of the wheel's timing moves him too.
  const leaveAt = removalStart(spin, hidden)
  return {
    enteredAt: spinStartAt + (reduced ? FADE_REDUCED_MS : ENTER_MS),
    brakeAt: spinStartAt + (BRAKE_FIFTHS * (stopAt - spinStartAt)) / 5,
    cheerAt,
    idleAt: cheerAt + CHEER_MS,
    leaveAt,
    goneAt: leaveAt + (reduced ? FADE_REDUCED_MS : LEAVE_MS),
  }
}

/** His stage and rig state at server time `nowMs`; null while he is not there: before the spin starts and once he has left. */
export function mascotPhase(spin: MascotSpin, hidden: boolean, reduced: boolean, nowMs: number): { stage: MascotStage, state: RigState } | null {
  const { enteredAt, brakeAt, cheerAt, idleAt, leaveAt, goneAt } = mascotMoments(spin, hidden, reduced)
  if (nowMs < spin.spinStartAt || nowMs >= goneAt) return null
  const stage = nowMs >= leaveAt ? 'out' : nowMs < enteredAt ? 'in' : 'on'
  if (nowMs < brakeAt) return { stage, state: 'excited' }
  if (nowMs < cheerAt) return { stage, state: 'suspense' }
  return { stage, state: nowMs < idleAt ? 'cheer' : 'idle' }
}

/**
 * Where his box stands, relative to the wheel's square (its origin is the square's top left; `left` is CSS because it depends on the wheel's width):
 * `size` px square, `top`, and `overhang` px past the wheel's right edge. `left` puts the box's right edge at the wheel's edge plus the overhang, but never
 * left of the wheel's centre + 24 px, which is right of the flapper (44 px wide, centred). From md up the wheel is 420 px and he stands 300 px from its left;
 * below it the wheel is 332 px on a phone and he stands 190 px from it. He stays behind the wheel and above its centre line. `travel` is where he comes
 * from (and goes back to), in px from his place.
 */
export function mascotBox(width: MascotWidth) {
  const box = width === 'md'
    ? { size: 232, top: 18, overhang: 112, travel: { x: -130, y: 100 } }
    : { size: 150, top: -20, overhang: 8, travel: { x: -100, y: 80 } }
  return { ...box, left: `max(50% + 24px, 100% - ${box.size - box.overhang}px)` }
}
