/** Whether motion is reduced, by the device or the in-app setting: the tokens put it in `--cp-motion` for JS. */
export function reducedMotion() {
  return getComputedStyle(document.documentElement).getPropertyValue('--cp-motion').trim() === 'reduced'
}

/** A duration or easing token (`--cp-dur-slow`, `--cp-ease-out`) for the Web Animations API, with a fallback when the stylesheet has none. */
function motionToken(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** The landing of an avatar that took a new place, by an own drop, the menu or somebody else's move (04-motion § Avatar: `scale .6→1.12→1`). */
export function pop(element: Element): void {
  const picture = element.firstElementChild
  if (!picture || reducedMotion() || typeof picture.animate !== 'function') return
  picture.animate(
    [{ transform: 'scale(.6)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 340, easing: motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)') },
  )
}

/** How an element travels: `glide` to a new place, `bounce` back after a refusal. */
export type GlideKind = 'glide' | 'bounce'

/** Where an element sits and where it sat. A move from `from` to `to` is a Flip: the element is at `to`, drawn from `from` first, a glide with 0.36 s `EASE.pop` (04-motion § Avatar, #208). */
export function glide(element: Element, from: Pick<DOMRect, 'left' | 'top'>, to: Pick<DOMRect, 'left' | 'top'>, kind: GlideKind = 'glide'): void {
  if (reducedMotion() || typeof element.animate !== 'function') return
  const dx = from.left - to.left
  const dy = from.top - to.top
  if (dx === 0 && dy === 0) return
  const duration = Number.parseFloat(kind === 'bounce' ? motionToken('--cp-dur-slower', '600ms') : motionToken('--cp-dur-slow', '360ms'))
  const easing = kind === 'bounce' ? motionToken('--cp-ease-spring', 'cubic-bezier(.5,1.8,.4,.8)') : motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)')
  element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration, easing })
}

/** What a Member whose place changed gets under reduced motion instead of the glide and the pop: a short fade at the new place (04-motion § Avatar: „Reduced: position changes with a 0.14 fade“, #237). */
export function fade(element: Element): void {
  if (!reducedMotion() || typeof element.animate !== 'function') return
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Number.parseFloat(motionToken('--cp-dur-fast', '140ms')), easing: motionToken('--cp-ease-out', 'ease-out') })
}

// The Veto window (04-motion § Veto window, #231). Under reduced motion each of these is a 0.2 s fade at the same moment.

/** The fade every Veto-window animation becomes under reduced motion: 0.2 s, after the same delay. */
const REDUCED_FADE_MS = 200

/** Runs `keyframes` on the element, or under reduced motion a fade with the same delay. */
function veto(element: Element, keyframes: Keyframe[], options: { duration: number, delay?: number, easing: string }): void {
  if (typeof element.animate !== 'function') return
  if (reducedMotion()) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, delay: options.delay ?? 0, easing: motionToken('--cp-ease-out', 'ease-out'), fill: 'backwards' })
  else element.animate(keyframes, { ...options, fill: 'backwards' })
}

/** The seal stamp when the own Party's Veto is cast: `scale 2→1, rotation −8°`, 0.3 s `EASE.pop` (the handoff's back.out). */
export function sealStamp(element: Element): void {
  veto(element, [{ transform: 'rotate(-8deg) scale(2)', opacity: 0 }, { transform: 'rotate(-8deg) scale(1)', opacity: 1 }], { duration: 300, easing: motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)') })
}

/** A Party's tile at the reveal: `rotateY 90°→0` (perspective 600), 0.42 s `EASE.out`, each tile 0.08 s after the one before it. */
export function revealTile(element: Element, index: number): void {
  veto(element, [{ transform: 'perspective(600px) rotateY(90deg)' }, { transform: 'perspective(600px) rotateY(0deg)' }], { duration: 420, delay: index * 80, easing: motionToken('--cp-ease-out', 'cubic-bezier(.16,1,.3,1)') })
}

/** The „VETO“ stamp on a tile: `scale 2.2→.9→1, rotation −8°`, 0.52 s, 0.3 s after the tiles start to turn. */
export function vetoStamp(element: Element): void {
  veto(element, [{ transform: 'rotate(-8deg) scale(2.2)', opacity: 0, offset: 0 }, { transform: 'rotate(-8deg) scale(.9)', opacity: 1, offset: 0.6 }, { transform: 'rotate(-8deg) scale(1)', opacity: 1, offset: 1 }], { duration: 520, delay: 300, easing: motionToken('--cp-ease-out', 'cubic-bezier(.16,1,.3,1)') })
}

/** The timer's tick in the last ten seconds: `scale 1.12→1`, 0.26 s `EASE.snap`. A reduced-motion page does not pulse. */
export function clockTick(element: Element): void {
  if (reducedMotion() || typeof element.animate !== 'function') return
  element.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: motionToken('--cp-ease-snap', 'cubic-bezier(.2,0,0,1)') })
}
