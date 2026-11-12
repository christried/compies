import type { Gsap } from './gsap'
import { mascotBox, mascotMoments, type MascotSpin, type MascotWidth } from './wheel-mascot'

// Compibert's way in and out at the wheel (#526, 04-motion § Lucky Wheel · Compibert, ADR 0015): one paused GSAP timeline of transform and opacity on
// his box, which the component moves with the server's clock as `ceremony-run.ts` does the Pokal-Lauf: the time put in is the clock minus the
// spin's start, so a late joiner or a returning tab lands where the clock says and nothing is replayed. His state is not on the timeline:
// `mascotPhase` says it from the time. The eases are GSAP's names as 04-motion writes them (CODING_STANDARDS § Motion); `wheel-mascot-run.test.ts`
// reads them off the timeline. Client only: it works on an element.

const ENTER_S = 0.45
const LEAVE_S = 0.4
/** `dur-fast`: the opacity ramp that hides the last pixels at the rim, in and out. */
const FADE_S = 0.14
/** `dur-base`: reduced motion's fade, in place, in and out. */
const FADE_REDUCED_S = 0.22

export interface MascotRun {
  width: MascotWidth
  spin: MascotSpin
  hidden: boolean
  reduced: boolean
}

/**
 * Builds the travel on `element`: set to its first frame (behind the rim, transparent), paused, as long as the way out. Every tween runs in timeline
 * order (`overwrite: false`, although `loadGsap` sets `'auto'`), and the ways out start from their stated values without rendering at once, so a seek
 * straight to a late time gives what playing through would. Under reduced motion there is no x and no y: he fades in place.
 */
export function buildMascotTravel(gsap: Gsap, element: HTMLElement, { width, spin, hidden, reduced }: MascotRun) {
  const { travel } = mascotBox(width)
  const leaveAt = (mascotMoments(spin, hidden, reduced).leaveAt - spin.spinStartAt) / 1000
  const tl = gsap.timeline({ paused: true, defaults: { overwrite: false } })
  if (reduced) {
    tl.fromTo(element, { opacity: 0 }, { opacity: 1, duration: FADE_REDUCED_S, ease: 'expo.out' }, 0)
    tl.fromTo(element, { opacity: 1 }, { opacity: 0, duration: FADE_REDUCED_S, ease: 'expo.in', immediateRender: false }, leaveAt)
    return tl
  }
  // In along the radius from behind the rim, and out the way he came, with the drawn slice. `expo.out` is the nearest GSAP name of `--cp-ease-out`.
  tl.fromTo(element, { x: travel.x, y: travel.y }, { x: 0, y: 0, duration: ENTER_S, ease: 'back.out(1.8)' }, 0)
  tl.fromTo(element, { opacity: 0 }, { opacity: 1, duration: FADE_S, ease: 'expo.out' }, 0)
  tl.fromTo(element, { x: 0, y: 0 }, { x: travel.x, y: travel.y, duration: LEAVE_S, ease: 'power2.in', immediateRender: false }, leaveAt)
  tl.fromTo(element, { opacity: 1 }, { opacity: 0, duration: FADE_S, ease: 'none', immediateRender: false }, leaveAt + LEAVE_S - FADE_S)
  return tl
}
