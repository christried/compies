import { motionMs, motionToken, reducedMotion, unwatched } from './motion'
import type { Rect } from './tour-placement'
import { bezier, IO_EASE } from './wheel'

// The Tour's motion (#460, 17-rundgang.md § Additions to 04-motion, the Rundgang entry). Web Animations, not GSAP (ADR 0015: new motion goes into
// `motion.ts` and its neighbours unless it animates Compibert's rig or plays inside the ceremony): the numbers and tokens are the note's, durations
// read with `motionMs`, eases with `motionToken`. Under reduced motion each piece is opacity only, `dur-fast`, linear. Where `animate` is missing
// (happy-dom) or the tab is hidden, the callers change at once: `canAnimate`.

const OUT = 'cubic-bezier(.16,1,.3,1)'
const IN = 'cubic-bezier(.7,0,.84,0)'
const IO = 'cubic-bezier(.65,0,.35,1)'
const POP = 'cubic-bezier(.34,1.56,.64,1)'

/** The hole as the Spotlight draws it: window coordinates, the corner radius and the ring's width. */
export type TourHole = Rect & { radius: number, ring: number }

/** What a change of step or the end can play: Web Animations on a visible tab. */
export function canAnimate(): boolean {
  return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function' && !unwatched()
}

/** The tokens the Tour's motion reads. */
function tokens() {
  return {
    fast: motionMs('--cp-dur-fast', '140ms'),
    base: motionMs('--cp-dur-base', '220ms'),
    slow: motionMs('--cp-dur-slow', '360ms'),
    out: motionToken('--cp-ease-out', OUT),
    easeIn: motionToken('--cp-ease-in', IN),
    io: motionToken('--cp-ease-io', IO),
  }
}

/** What a running piece of Tour motion hands back: when it is over, and a way to stop it where it stands. */
export interface TourPlay { finished: Promise<void>, cancel: () => void }

const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }]

/** Stops an animation where it stands. Its `finished` promise rejects when it is cancelled, and nobody here waits for it: the rejection is taken. */
export function cancelQuietly(animation: Animation): void {
  animation.finished?.catch(() => {})
  animation.cancel()
}

/** The Tour opens: the layer fades in, the bubble scales up from .96 with it, 60 ms later. Reduced: both only fade. */
export function tourEnter(layer: Element, bubble: Element): void {
  if (typeof layer.animate !== 'function') return
  const { fast, base, out } = tokens()
  if (reducedMotion()) {
    for (const part of [layer, bubble]) part.animate(FADE, { duration: fast, easing: 'linear', fill: 'backwards' })
    return
  }
  layer.animate(FADE, { duration: base, easing: out, fill: 'backwards' })
  bubble.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1)' }], { duration: base, delay: 60, easing: out, fill: 'backwards' })
}

/** A step change, first move: the bubble leaves (`opacity 1→0, scale .98`, fast, in). Held at its last frame until the caller swaps the content. */
export function bubbleOut(bubble: Element): Animation | null {
  if (typeof bubble.animate !== 'function') return null
  const { fast, easeIn } = tokens()
  return bubble.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.98)' }], { duration: fast, easing: easeIn, fill: 'forwards' })
}

/** Where the bubble comes from, 8 px toward the thing: the tail's side (the reference's `off()`). */
function slideFrom(side: string): [number, number] {
  if (side === 'top') return [0, 8]
  if (side === 'bottom') return [0, -8]
  if (side === 'right') return [-8, 0]
  if (side === 'left') return [8, 0]
  return [0, 0]
}

/**
 * The bubble arrives: `opacity 0→1` from 8 px on the tail's side (toward the thing) to 0, `dur-base`, ease out; a bubble with no thing scales `.96→1` instead. Under
 * reduced motion only the fade, fast and linear.
 */
export function bubbleIn(bubble: Element, side: string): Animation | null {
  if (typeof bubble.animate !== 'function') return null
  const { fast, base, out } = tokens()
  if (reducedMotion()) return bubble.animate(FADE, { duration: fast, easing: 'linear', fill: 'backwards' })
  const [x, y] = slideFrom(side)
  const from = side === 'none' ? 'scale(.96)' : `translate(${x}px, ${y}px)`
  const to = side === 'none' ? 'scale(1)' : 'translate(0px, 0px)'
  return bubble.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: to }], { duration: base, easing: out, fill: 'backwards' })
}

/** The closed hole: 2 px at the centre of a rect, no ring. */
function closedAt(hole: TourHole): TourHole {
  return { x: hole.x + hole.w / 2 - 1, y: hole.y + hole.h / 2 - 1, w: 2, h: 2, radius: 1, ring: 0 }
}

const frame = (hole: TourHole): Keyframe => ({ left: `${hole.x}px`, top: `${hole.y}px`, width: `${hole.w}px`, height: `${hole.h}px`, borderRadius: `${hole.radius}px`, outlineWidth: `${hole.ring}px` })

/**
 * The hole goes from one place to the next: `slow` on the in-out curve, together with the page's scroll. From the closed hole it opens out of the thing's
 * centre (`slow`, ease out, the ring grows 0→3); into the closed hole it shrinks into its old centre (`dur-base`, ease in). Reduced motion cuts: nothing plays.
 * Held at its last frame until the caller commits the new hole.
 */
export function moveHole(spot: Element, from: TourHole, to: TourHole): Animation | null {
  if (reducedMotion() || typeof spot.animate !== 'function') return null
  const { base, slow, out, easeIn, io } = tokens()
  const opening = from.ring === 0 && to.ring > 0
  const closing = from.ring > 0 && to.ring === 0
  if (from.ring === 0 && to.ring === 0) return null
  const start = opening ? closedAt(to) : from
  const end = closing ? closedAt(from) : to
  const [duration, easing] = opening ? [slow, out] : closing ? [base, easeIn] : [slow, io]
  return spot.animate([frame(start), frame(end)], { duration, easing, fill: 'forwards' })
}

/**
 * The page's scroll glides to `to` along the in-out curve over `ms` (the hole's own track: they land together). Returns the way to stop it; the last frame
 * is always `to`. Nothing runs where frames do not (a hidden tab): the caller scrolls at once there.
 */
export function glideScroll(from: number, to: number, ms: number, scrollTo: (y: number) => void): () => void {
  let stopped = false
  let frameId = 0
  const startedAt = performance.now()
  const step = (now: number) => {
    if (stopped) return
    const progress = Math.min(Math.max((now - startedAt) / ms, 0), 1)
    scrollTo(from + (to - from) * bezier(IO_EASE, progress))
    if (progress < 1) frameId = requestAnimationFrame(step)
  }
  frameId = requestAnimationFrame(step)
  return () => {
    stopped = true
    cancelAnimationFrame(frameId)
  }
}

/**
 * The Tour ends: the bubble `opacity→0, scale .96` (fast, in), the layer `opacity→0` (base, in) 60 ms later; reduced: both fade, fast and linear. The layer
 * stays at its last frame until the caller removes it. Resolves when both are out, at the latest after the longer one + 50 ms (a backgrounded tab may never
 * finish one), and at once where nothing can animate.
 */
export function tourExit(layer: Element, bubble: Element | null): TourPlay {
  if (typeof layer.animate !== 'function' || unwatched()) return { finished: Promise.resolve(), cancel() {} }
  const { fast, base, easeIn } = tokens()
  const reduced = reducedMotion()
  const fade: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]
  const animations: Animation[] = []
  let longest: number
  if (reduced) {
    animations.push(layer.animate(fade, { duration: fast, easing: 'linear', fill: 'forwards' }))
    if (bubble) animations.push(bubble.animate(fade, { duration: fast, easing: 'linear', fill: 'forwards' }))
    longest = fast
  }
  else {
    if (bubble) animations.push(bubble.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: fast, easing: easeIn, fill: 'forwards' }))
    animations.push(layer.animate(fade, { duration: base, delay: 60, easing: easeIn, fill: 'forwards' }))
    longest = base + 60
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const finished = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, longest + 50)
    void Promise.all(animations.map(animation => animation.finished?.catch(() => {}))).then(() => resolve())
  }).then(() => clearTimeout(timer))
  return {
    finished,
    cancel() {
      clearTimeout(timer)
      for (const animation of animations) animation.cancel()
    },
  }
}

/** The header's avatar ticks once as the Tour ends, pointing at „Profil“, where the Tour lives: `scale 1→1.14→1`, `dur-base`, `EASE.pop` (the `animate-tick` move). Nothing under reduced motion. */
export function tourTick(avatar: Element | null): void {
  if (!avatar || reducedMotion() || typeof avatar.animate !== 'function') return
  const easing = motionToken('--cp-ease-pop', POP)
  avatar.animate([{ transform: 'scale(1)', easing }, { transform: 'scale(1.14)', offset: 0.5, easing }, { transform: 'scale(1)' }], { duration: motionMs('--cp-dur-base', '220ms') })
}
