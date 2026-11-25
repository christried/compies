import { motionMs, motionToken, reducedMotion } from './motion'

// The Theme reveal (#931, 04-motion § UI enters, GLOSSARY: Appearance): a new Appearance does not snap in, it spreads as a circle from
// the option the User tapped over the old picture (a View Transition whose new picture is clipped by the growing circle), or, under
// Reduced motion, without View Transitions or with no tapped option to spread from (a switch back after a failed save), the colours
// cross-fade over `dur-fast` (main.css `data-theme-reveal="fade"`). A port of malkochen's reveal onto COMPIES's tokens. The showing is
// `apply`: with a View Transition the browser takes the old picture first and calls it a frame later, so what shows the new look must
// not run before (useAppearance defers it for that reason). A choice that shows the same look does not reveal at all.

/** The latest reveal, so an older one ending does not end a newer one's. */
let latestReveal: object | null = null

/**
 * The growing circle's frames: THE one place of its edge (a plain circle). The centre and the radius are the caller's, and so are the
 * timing and the state handling, so a designed edge (#933) replaces only the inside of this function and the `spread` rule of main.css.
 */
export function revealFrames(x: number, y: number, radius: number): PropertyIndexedKeyframes {
  return { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }
}

/**
 * Runs `apply`, the showing of the new Appearance, inside the reveal. `origin` is the tapped option (null: none to spread from);
 * `changes` is whether the look on screen differs, and when it does not `apply` runs at once and nothing else happens. Resolves when
 * the reveal is over; `apply` may return a promise, which the View Transition waits for before it takes the new picture.
 */
export async function revealTheme(origin: HTMLElement | null, changes: boolean, apply: () => void | Promise<void>): Promise<void> {
  if (!changes) {
    await apply()
    return
  }
  // The circle is measured now, before any await and before `apply`: the header's menu closes on the tap, and a removed element has
  // an empty rect.
  const circle = origin && typeof document.startViewTransition === 'function' && !reducedMotion() ? measure(origin) : null
  const reveal = {}
  latestReveal = reveal
  const html = document.documentElement
  if (!circle) {
    html.dataset.themeReveal = 'fade'
    // The cross-fade's transitions in place before the colours change.
    void getComputedStyle(html).backgroundColor
    await apply()
    await new Promise(resolve => setTimeout(resolve, motionMs('--cp-dur-fast', '140ms')))
  }
  else {
    html.dataset.themeReveal = 'spread'
    const transition = document.startViewTransition(apply)
    await transition.ready.then(() => html.animate(
      revealFrames(circle.x, circle.y, circle.radius),
      { duration: motionMs('--cp-dur-slower', '600ms'), easing: motionToken('--cp-ease-io', 'cubic-bezier(.65,0,.35,1)'), pseudoElement: '::view-transition-new(root)' },
    ).finished).catch(() => {})
    await transition.finished.catch(() => {})
  }
  if (latestReveal === reveal) {
    latestReveal = null
    delete html.dataset.themeReveal
  }
}

/** The tapped option's centre and the radius that reaches the farthest corner of the window from it. */
function measure(origin: HTMLElement) {
  const { left, top, width, height } = origin.getBoundingClientRect()
  const x = left + width / 2
  const y = top + height / 2
  return { x, y, radius: Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) }
}
