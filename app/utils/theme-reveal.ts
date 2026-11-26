import { motionMs, motionToken, reducedMotion } from './motion'

// The Theme reveal (#931, 04-motion § UI enters, GLOSSARY: Appearance): a new Appearance does not snap in, it spreads as a circle from
// the option the User tapped over the old picture (a View Transition whose new picture is clipped by the growing circle), or, under
// Reduced motion, without View Transitions or with no tapped option to spread from (a switch back after a failed save), the colours
// cross-fade over `dur-fast` (compies-theme.css `data-theme-reveal="fade"`). A port of malkochen's reveal onto COMPIES's tokens. The showing is
// `apply`: with a View Transition the browser takes the old picture first and calls it a frame later, so what shows the new look must
// not run before (useAppearance defers it for that reason). A choice that shows the same look does not reveal at all.
// The circle's clip is `revealFrames` (the script animates it on the new picture). Its edge (#933, note 20 „Kartenkante“) is a card's
// cream line and ink shadow: `themeEdge`, the one place of its markup, and the `.theme-edge` rules of compies-theme.css. It is drawn
// only with the circle, in the new picture only.

/** The latest reveal, so an older one ending does not end a newer one's. */
let latestReveal: object | null = null
/** The edge of the latest spread that is in the document, so a newer spread can take it out before it starts (#933). */
let edgeInDocument: HTMLElement | null = null

/**
 * The growing circle's clip frames: a plain circle from its centre. The centre and the radius are the caller's, and so are the timing
 * and the state handling. The circle's edge is not here: it is `themeEdge` and the `.theme-edge` rules of compies-theme.css (#933).
 */
export function revealFrames(x: number, y: number, radius: number): PropertyIndexedKeyframes {
  return { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }
}

/**
 * The edge of the growing circle (#933): a cream line on the rim and an ink shadow outside it, the new look arriving like a card. The
 * line always takes Dunkel's tokens and the shadow Hell's, whatever the page shows (each `<i>` has its own `data-theme`), so only the
 * `.theme-edge` rules decide how they draw; `to` is the look the circle spreads to. Aria-hidden: it is decoration.
 */
function themeEdge(circle: { x: number, y: number, radius: number }, to: 'light' | 'dark'): HTMLElement {
  const edge = document.createElement('div')
  edge.className = 'theme-edge'
  edge.dataset.to = to
  edge.setAttribute('aria-hidden', 'true')
  edge.style.setProperty('--vt-x', `${circle.x}px`)
  edge.style.setProperty('--vt-y', `${circle.y}px`)
  edge.style.setProperty('--vt-r', `${circle.radius}px`)
  const disc = document.createElement('div')
  disc.className = 'theme-edge__disc'
  const line = document.createElement('i')
  line.className = 'theme-edge__line'
  line.dataset.theme = 'dark'
  const shadow = document.createElement('i')
  shadow.className = 'theme-edge__shadow'
  shadow.dataset.theme = 'light'
  disc.append(line, shadow)
  edge.append(disc)
  return edge
}

/**
 * Runs `apply`, the showing of the new Appearance, inside the reveal. `origin` is the tapped option (null: none to spread from);
 * `changes` is whether the look on screen differs, and when it does not `apply` runs at once and nothing else happens. `to` is the look
 * the spread goes to: with it the circle has its edge (#933), without it the circle has none. Resolves when the reveal is over; `apply`
 * may return a promise, which the View Transition waits for before it takes the new picture.
 */
export async function revealTheme(origin: HTMLElement | null, changes: boolean, apply: () => void | Promise<void>, to?: 'light' | 'dark'): Promise<void> {
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
    // A newer spread's edge leaves before this one starts, so two edges never meet under one view-transition name (#933).
    edgeInDocument?.remove()
    edgeInDocument = null
    const edge = to ? themeEdge(circle, to) : null
    const transition = document.startViewTransition(async () => {
      await apply()
      // The edge joins the new picture only: after `apply`, so it is not in the old one and its group sits above the root's. Only while
      // this reveal is the latest: a tap within one frame skips this transition, but its callback still runs, and a second edge would
      // meet the newer one under the same view-transition name.
      if (edge && latestReveal === reveal) {
        document.body.append(edge)
        edgeInDocument = edge
      }
    })
    await transition.ready.then(() => {
      // The edge's animations were paused until now: the disc and the shadow start in the frame the circle's clip does.
      edge?.classList.add('is-running')
      return html.animate(
        revealFrames(circle.x, circle.y, circle.radius),
        { duration: motionMs('--cp-dur-slower', '600ms'), easing: motionToken('--cp-ease-io', 'cubic-bezier(.65,0,.35,1)'), pseudoElement: '::view-transition-new(root)' },
      ).finished
    }).catch(() => {})
    await transition.finished.catch(() => {})
    // Also when the transition was skipped: the edge goes with the reveal that drew it.
    if (edge) {
      edge.remove()
      if (edgeInDocument === edge) edgeInDocument = null
    }
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
