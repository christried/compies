// Where the Tour's bubble and hole stand (#460, ADR 0017): the port of `lay()` of `docs/design_handoff_compies/reference/RundgangStage.dc.html`, as one
// pure function over numbers. `TourLayer` measures the page and passes the numbers in, so the placement is tested without a component.
// Pure TS on purpose: no auto-imports, no DOM.

/** The Tour is narrow below the theme's `sm` breakpoint (`--breakpoint-sm: 37.5rem`, pinned by a unit test). The side panel and the tabs change at `md`: that is the steps' `applies`. */
export const TOUR_NARROW_BELOW = 600

/** The reference's `CFG`: padding of the hole, gap hole to bubble, window margin, the face's size and place, the room the face takes on the bubble's top edge, tail size, scroll lead, the drop shadow's offset, the bottom safe area. */
export const TOUR_LAYOUT = {
  wide: { pad: 8, gap: 24, margin: 24, S: 72, faceL: 14, faceT: -20, faceZone: 92, tail: 20, lead: 24, sh: 10, safe: 0 },
  narrow: { pad: 6, gap: 20, margin: 12, S: 56, faceL: 8, faceT: -16, faceZone: 70, tail: 16, lead: 16, sh: 10, safe: 18 },
} as const

/** The layout numbers for the window's width: the one home of the face's, the tail's and the placement's sizes (#785); TourFace and TourBubble read them here. */
export function tourLayout(narrow: boolean) {
  return narrow ? TOUR_LAYOUT.narrow : TOUR_LAYOUT.wide
}

/** The bubble's width on a wide window. */
export const TOUR_BUBBLE_WIDTH = 400

/** The bubble's width: 400 px, or the window less 12 px a side. */
export function tourBubbleWidth(windowWidth: number): number {
  return windowWidth < TOUR_NARROW_BELOW ? windowWidth - 24 : TOUR_BUBBLE_WIDTH
}

export interface Rect { x: number, y: number, w: number, h: number }

/** What the step points at. `x`, `y` are page coordinates: for a thing that scrolls `y` is the rect's top plus the scroll. */
export interface TourThing extends Rect { radius: number, scrolls: boolean }

export interface TourPlacementInput {
  /** `documentElement.clientWidth` and `innerHeight`. */
  window: { w: number, h: number }
  /** Bottom edge of the sticky header: the top of the usable area. */
  headerBottom: number
  /** Top edge of the phone's tab bar when it shows, else the window's height (the reference's `usBot`). */
  stageBottom: number
  /** `scrollHeight - innerHeight`, 0 or more. */
  maxScroll: number
  thing: TourThing | null
  /** The page stands here, whatever the thing's place asks for: a User scrolled it, and the hole follows the thing instead of taking the page back. */
  keepScroll?: number
  /** Where the tail aims, in the thing's coordinates; `scrolls` says whether it moves with the page (the thing's own flag when left out). Default: the thing's centre. */
  anchor?: { x: number, y: number, scrolls?: boolean }
  /** Measured with the same width and content. */
  bubbleHeight: number
}

export interface TourPlacement {
  /** Where to scroll the page; null: leave it (no thing, or a thing that does not scroll). */
  scroll: number | null
  /** The bubble's edge that holds the tail. */
  side: 'top' | 'bottom' | 'left' | 'right' | 'none'
  /** Window coordinates, at the final scroll. */
  bubble: Rect
  /** Window coordinates; `ring` is the outline's width, 3 or 0. */
  hole: Rect & { radius: number, ring: number }
  /** Along the bubble's edge, relative to its top-left. */
  tail: { x: number, y: number } | null
  /** Window coordinates, at the final scroll. */
  anchor: { x: number, y: number } | null
  /** Degrees from the face's centre to the anchor, the reference's `dir`. */
  faceDir: number
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Places the bubble and the hole for one step. The note's rules (17-rundgang.md § Placement rules) are in the order of the branches. */
export function placeTour(input: TourPlacementInput): TourPlacement {
  const { window: win, headerBottom, stageBottom, maxScroll, thing, bubbleHeight } = input
  const narrow = win.w < TOUR_NARROW_BELOW
  const C = tourLayout(narrow)
  const bw = tourBubbleWidth(win.w)
  const bh = bubbleHeight
  const minY = headerBottom + C.margin
  const maxY = win.h - C.margin - C.safe

  const faceDir = (bubble: { x: number, y: number }, anchor: { x: number, y: number } | null) => {
    if (!anchor) return 0
    const faceX = bubble.x + C.faceL + C.S / 2
    const faceY = bubble.y + C.faceT + C.S / 2
    return Math.round(Math.atan2(anchor.y - faceY, anchor.x - faceX) * 180 / Math.PI)
  }

  if (!thing) {
    // Closed: the page is dark, the bubble stands in the middle, and the 2 px hole sits under its centre so the bubble always covers it.
    const bubble = { x: Math.round((win.w - bw) / 2), y: Math.round((win.h - bh) * 0.46), w: bw, h: bh }
    return {
      scroll: null,
      side: 'none',
      bubble,
      hole: { x: bubble.x + bw / 2 - 1, y: bubble.y + bh / 2 - 1, w: 2, h: 2, radius: 1, ring: 0 },
      tail: null,
      anchor: null,
      faceDir: 0,
    }
  }

  // The hole and the anchor at a scroll: a thing in the sticky chrome does not move with it.
  const build = (scroll: number) => {
    const top = thing.scrolls ? thing.y - scroll : thing.y
    const x = thing.x - C.pad
    let y = top - C.pad
    const x2 = thing.x + thing.w + C.pad
    let y2 = top + thing.h + C.pad
    // A thing that sits right under the header is flush with it (the side panel).
    if (!thing.scrolls && Math.abs(top - headerBottom) <= 1) y = top
    // A thing under the header or the tab bar: the hole is clipped to the stage, so the ring is open where the thing goes on.
    if (thing.scrolls) {
      y = Math.max(y, headerBottom)
      y2 = Math.min(y2, stageBottom)
    }
    const round = thing.radius >= Math.min(thing.w, thing.h) / 2 - 0.5
    // A thing scrolled out of the usable area has no height left, and no ring to show.
    const height = Math.max(0, y2 - y)
    const hole = {
      x,
      y,
      w: x2 - x,
      h: height,
      radius: round ? Math.round(Math.min(x2 - x, height) / 2) : thing.radius + C.pad,
      ring: height > 0 ? 3 : 0,
    }
    let anchor: { x: number, y: number }
    if (input.anchor) {
      const moves = input.anchor.scrolls ?? thing.scrolls
      anchor = { x: input.anchor.x, y: moves ? input.anchor.y - scroll : input.anchor.y }
    }
    else {
      anchor = { x: thing.x + thing.w / 2, y: thing.h > (stageBottom - headerBottom) / 2 ? top + 48 : top + thing.h / 2 }
    }
    return { hole, anchor }
  }

  const kept = input.keepScroll !== undefined && thing.scrolls
  let scroll = kept ? input.keepScroll! : thing.scrolls ? clamp(thing.y - (headerBottom + C.lead), 0, maxScroll) : 0
  let at = build(scroll)
  let side: TourPlacement['side']
  let bx = 0
  let by: number
  const centre = (x: number) => clamp(x - bw / 2, C.margin, win.w - C.margin - C.sh - bw)
  const fitsBelow = at.hole.y + at.hole.h + C.gap + bh <= maxY
  const fitsAbove = at.hole.y - C.gap - bh >= minY
  const roomLeft = at.hole.x - C.gap - C.margin
  const roomRight = win.w - (at.hole.x + at.hole.w) - C.gap - C.margin - C.sh
  if (fitsBelow) {
    side = 'top'
    by = at.hole.y + at.hole.h + C.gap
  }
  else if (fitsAbove) {
    side = 'bottom'
    by = at.hole.y - C.gap - bh
  }
  else if (!narrow && (roomLeft >= bw || roomRight >= bw)) {
    // Beside: the side with more room; the tail is on the edge that faces the thing, at the anchor's height. („right“ is the bubble left of the thing.)
    side = roomLeft >= roomRight ? 'right' : 'left'
    bx = side === 'right' ? at.hole.x - C.gap - bw : at.hole.x + at.hole.w + C.gap
    by = clamp(at.anchor.y - 40, minY, maxY - bh)
  }
  else {
    // No room, or taller than the window: the bubble docks at the window's bottom over the thing, and the page scrolls on until the anchor sits above it.
    side = 'top'
    by = maxY - bh
    if (thing.scrolls && !kept) {
      const limit = by - C.gap - 24
      if (at.anchor.y > limit) {
        scroll = clamp(scroll + (at.anchor.y - limit), 0, maxScroll)
        at = build(scroll)
      }
    }
  }
  if (side === 'top' || side === 'bottom') {
    bx = centre(at.anchor.x)
    // The anchor would fall into the face's corner on the top edge: the bubble moves left.
    if (side === 'top' && at.anchor.x - bx < C.faceZone + 14) bx = clamp(at.anchor.x - C.faceZone - 14, C.margin, win.w - C.margin - C.sh - bw)
  }

  const tailMin = 18 + C.tail * 0.7
  let tail: { x: number, y: number }
  if (side === 'top') tail = { x: clamp(at.anchor.x - bx, C.faceZone + C.tail * 0.7, bw - tailMin), y: 0 }
  else if (side === 'bottom') tail = { x: clamp(at.anchor.x - bx, tailMin, bw - tailMin), y: bh }
  else tail = { x: side === 'left' ? 0 : bw, y: clamp(at.anchor.y - by, side === 'left' ? Math.max(tailMin, C.faceT + C.S + 8) : tailMin, bh - tailMin) }

  const bubble = { x: Math.round(bx), y: Math.round(by), w: bw, h: bh }
  return { scroll: thing.scrolls ? scroll : null, side, bubble, hole: at.hole, tail, anchor: at.anchor, faceDir: faceDir(bubble, at.anchor) }
}
