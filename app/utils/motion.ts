/** Whether motion is reduced, by the device or the in-app setting: the tokens put it in `--cp-motion` for JS. */
export function reducedMotion() {
  return getComputedStyle(document.documentElement).getPropertyValue('--cp-motion').trim() === 'reduced'
}

/** A duration or easing token (`--cp-dur-slow`, `--cp-ease-out`) for the Web Animations API, with a fallback when the stylesheet has none. */
export function motionToken(name: string, fallback: string): string {
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

// The Veto window (04-motion § Veto window, #231). Under reduced motion each of these is a 0.2 s fade at the same moment: no stagger, no delay (F10).
// The Standings' pills and stamp (#276) follow the same rule.

/** The fade every Veto-window animation becomes under reduced motion: 0.2 s, with no delay. */
const REDUCED_FADE_MS = 200

/** Runs an animation of a stamp or a pill, or under reduced motion the 0.2 s fade at once (the tiles and stamps show at the same moment). */
function animateVeto(element: Element, keyframes: Keyframe[], options: { duration: number, delay?: number, easing: string }): void {
  if (typeof element.animate !== 'function') return
  if (reducedMotion()) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: motionToken('--cp-ease-out', 'ease-out'), fill: 'backwards' })
  else element.animate(keyframes, { ...options, fill: 'backwards' })
}

/** The seal stamp when the own Party's Veto is cast: `scale 2→1, rotation −8°`, 0.3 s `EASE.pop` (the handoff's back.out). */
export function sealStamp(element: Element): void {
  animateVeto(element, [{ transform: 'rotate(-8deg) scale(2)', opacity: 0 }, { transform: 'rotate(-8deg) scale(1)', opacity: 1 }], { duration: 300, easing: motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)') })
}

/** A Party's tile at the reveal: `rotateY 90°→0` (perspective 600), 0.42 s `EASE.out`, each tile 0.08 s after the one before it. */
export function revealTile(element: Element, index: number): void {
  animateVeto(element, [{ transform: 'perspective(600px) rotateY(90deg)' }, { transform: 'perspective(600px) rotateY(0deg)' }], { duration: 420, delay: index * 80, easing: motionToken('--cp-ease-out', 'cubic-bezier(.16,1,.3,1)') })
}

/** The „VETO“ stamp on a tile: `scale 2.2→.9→1, rotation −8°`, 0.52 s, 0.3 s after the tiles start to turn. */
export function vetoStamp(element: Element): void {
  animateVeto(element, [{ transform: 'rotate(-8deg) scale(2.2)', opacity: 0, offset: 0 }, { transform: 'rotate(-8deg) scale(.9)', opacity: 1, offset: 0.6 }, { transform: 'rotate(-8deg) scale(1)', opacity: 1, offset: 1 }], { duration: 520, delay: 300, easing: motionToken('--cp-ease-out', 'cubic-bezier(.16,1,.3,1)') })
}

/** The timer's tick in the last ten seconds: `scale 1.12→1`, 0.26 s `EASE.snap`. A reduced-motion page does not pulse. */
export function clockTick(element: Element): void {
  if (reducedMotion() || typeof element.animate !== 'function') return
  element.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: motionToken('--cp-ease-snap', 'cubic-bezier(.2,0,0,1)') })
}

// The Standings in motion (04-motion § Leaderboard, #276). The rows' glide is Vue's move transition on the Leaderboard's `tbody` group (`lb-swap`),
// the count is CpNum's (`lb-count`); these are the pieces drawn by the Web Animations API.

/** A Party's delta pill (`scale .3→1.15→1`, 0.42 s `EASE.pop`, 0.3 s after the news; under reduced motion a 0.2 s fade). */
export function deltaPop(element: Element): void {
  animateVeto(element, [{ transform: 'scale(.3)', opacity: 0, offset: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1, offset: 1 }], { duration: 420, delay: 300, easing: motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)') })
}

/** The winner's stamp (`scale 2→.9→1`, rotation 8°, 0.48 s, 0.52 s after the news, on the curve `DS Scoring` draws it with; under reduced motion a 0.2 s fade, still rotated). */
export function winnerStamp(element: Element): void {
  animateVeto(element, [{ transform: 'rotate(8deg) scale(2)', opacity: 0, offset: 0 }, { transform: 'rotate(8deg) scale(.9)', opacity: 1, offset: 0.7 }, { transform: 'rotate(8deg) scale(1)', opacity: 1, offset: 1 }], { duration: 480, delay: 520, easing: motionToken('--cp-ease-snap', 'cubic-bezier(.2,0,0,1)') })
}

/** What a row whose rank changed gets under reduced motion instead of the glide: its cells tint with the primary colour and fade back in 0.2 s (04-motion: „rows reorder instantly with a 0.2 highlight“). */
export function highlightRow(row: Element): void {
  if (!reducedMotion()) return
  for (const cell of row.children) {
    if (typeof cell.animate !== 'function') return
    cell.animate([{ backgroundColor: 'color-mix(in srgb, var(--cp-primary) 35%, var(--cp-surface))' }, { backgroundColor: 'var(--cp-surface)' }], { duration: REDUCED_FADE_MS, easing: 'linear' })
  }
}

// The page's reflow (#276, F4 of the s5 check): what moves because something above it left or arrived. 04-motion has no entry for a list or block reflow;
// it follows the entry the page's blocks already glide by, „UI enters“ (the banner: `EASE.out`), over the slow duration. A UI move never overshoots
// (04-motion: „UI … never overshoot“): `lb-swap`'s spring is for the Leaderboard's rows. The element ends on its laid-out place, so nothing snaps at the end.

/** The page's blocks glide to their new place (the Round cards: `CARD_REFLOW_CLASS`): a transform over `dur-slow` on `ease-out`, and at once under reduced motion (04-motion § UI enters: „Reduced: opacity only“). */
export const REFLOW_CLASS = 'transition-transform dur-slow ease-out motion-reduce:transition-none reduced:transition-none'

/**
 * The cards of a list that can cross it (the Round cards in a two-column grid: the second Result sends Round 3 540 px to the other side) glide on the in-out curve
 * over the slower duration, the UI's own tokens with no overshoot. On `REFLOW_CLASS`'s steep ease-out that move is 150 px in its first 60 fps frame, which reads
 * as a jump; on this one it is 43 px at most (0.8 review, F5). Reduced motion: at once.
 */
export const CARD_REFLOW_CLASS = 'transition-transform dur-slower ease-io motion-reduce:transition-none reduced:transition-none'

/**
 * A tab nobody is looking at stays calm (#276): a change read while the page is hidden moves the rows and blocks at once, so the glide does not start
 * when the Member returns (the browser holds a hidden page's transitions at their start). Evaluated with each render, which is when Vue plans the move:
 * `:move-class="unwatched() ? undefined : …"`.
 */
export const unwatched = () => import.meta.client && document.visibilityState === 'hidden'

/** Where an element sits in its list, against the list's padding box. */
interface Place { top: number, left: number, width: number, height: number }

/** Exact, not rounded: `offsetTop` rounds, and a leaver 0.2 px off its place gets a 0 s transition from Vue's move step, which cuts its fade (0.8 review, F5). */
function measure(element: HTMLElement, list: Element | null): Place {
  const rect = element.getBoundingClientRect()
  const origin = list?.getBoundingClientRect()
  return { top: rect.top - (origin?.top ?? 0) - (list?.clientTop ?? 0), left: rect.left - (origin?.left ?? 0) - (list?.clientLeft ?? 0), width: rect.width, height: rect.height }
}

/** Where the children of a list stood when the render's first leaver was pinned; dropped as soon as the render is done (the patch is synchronous). */
let places: WeakMap<Element, Place> | null = null

/**
 * Where `element` stands in the layout the render began with. Vue calls `before-leave` for each leaver in turn, and every pin takes a card out of the flow, so the
 * cards after it move up: measured then, a second leaver would be pinned one cell off, and Vue's move transition (which takes it for a card that moved) would
 * drag it across the grid while it fades. So the first call measures the whole list, before it changes anything.
 */
function placeOf(element: HTMLElement): Place {
  if (places === null) {
    const measured = new WeakMap<Element, Place>()
    for (const sibling of element.parentElement?.children ?? []) {
      if (sibling instanceof HTMLElement) measured.set(sibling, measure(sibling, element.parentElement))
    }
    places = measured
    queueMicrotask(() => {
      places = null
    })
  }
  return places.get(element) ?? measure(element, element.parentElement)
}

/**
 * `@before-leave` of a `TransitionGroup` whose leaver must not push its siblings around while it fades (Vue's documented pattern): it is pinned where it
 * is and leaves the layout in the very flush that starts its fade. Vue keeps a leaver in the layout until its fade ends and removes it outside any flush,
 * so the blocks below would jump once, unmeasured, and no move transition could play. The leaver's parent must be `relative` (its place is against it).
 * It is `inert` while it fades: no pointer, no focus. Under reduced motion it is gone at once (there is no fade to cover the jump), and so in a hidden tab,
 * where the browser runs no frame: Vue starts the fade on one, and the leaver would sit over its neighbours until the Member returns.
 */
export function leaveInPlace(element: Element): void {
  if (!(element instanceof HTMLElement)) return
  const { top, left, width, height } = placeOf(element)
  element.style.position = 'absolute'
  element.style.top = `${top}px`
  element.style.left = `${left}px`
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  element.inert = true
  if (reducedMotion() || unwatched()) element.style.display = 'none'
}
