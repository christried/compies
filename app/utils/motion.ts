/** Whether motion is reduced, by the device or the in-app setting: the tokens put it in `--cp-motion` for JS. */
export function reducedMotion() {
  return getComputedStyle(document.documentElement).getPropertyValue('--cp-motion').trim() === 'reduced'
}

/** A duration or easing token (`--cp-dur-slow`, `--cp-ease-out`) for the Web Animations API, with a fallback when the stylesheet has none. */
function motionToken(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** The landing of a dropped avatar: its picture pops from small to a little too big to its size (04-motion § Avatar). */
export function pop(element: Element): void {
  const picture = element.firstElementChild
  if (!picture || reducedMotion() || typeof picture.animate !== 'function') return
  picture.animate(
    [{ transform: 'scale(.6)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 340, easing: motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)') },
  )
}

/** A Team word that arrives pops in under its avatar (04-motion § Team name: `dur-slow ease-pop`); reduced motion shows it still. */
export function popIn(element: Element): void {
  if (reducedMotion() || typeof element.animate !== 'function') return
  element.animate(
    [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: Number.parseFloat(motionToken('--cp-dur-slow', '360ms')), easing: motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)') },
  )
}

/** How an element travels: `glide` for a place somebody else took (or the own move), `bounce` for the way back after a refusal (04-motion § Avatar). */
export type GlideKind = 'glide' | 'bounce'

/** Where an element sits and where it sat. A move from `from` to `to` is a Flip: the element is at `to`, drawn from `from` first. */
export function glide(element: Element, from: Pick<DOMRect, 'left' | 'top'>, to: Pick<DOMRect, 'left' | 'top'>, kind: GlideKind = 'glide'): void {
  if (reducedMotion() || typeof element.animate !== 'function') return
  const dx = from.left - to.left
  const dy = from.top - to.top
  if (dx === 0 && dy === 0) return
  const duration = Number.parseFloat(kind === 'bounce' ? motionToken('--cp-dur-slower', '600ms') : motionToken('--cp-dur-slow', '360ms'))
  const easing = kind === 'bounce' ? motionToken('--cp-ease-spring', 'cubic-bezier(.5,1.8,.4,.8)') : motionToken('--cp-ease-out', 'cubic-bezier(.16,1,.3,1)')
  element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration, easing })
}
