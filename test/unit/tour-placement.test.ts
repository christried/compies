import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { placeTour, TOUR_LAYOUT, TOUR_NARROW_BELOW, type TourPlacementInput, type TourThing } from '../../app/utils/tour-placement'

// Where the Tour's bubble stands and where its hole is (#460): one pure function, the port of `lay()` of
// `docs/design_handoff_compies/reference/RundgangStage.dc.html`. The literals below are what that function gives for these windows and things.

const WIDE: Omit<TourPlacementInput, 'thing'> = { window: { w: 1440, h: 900 }, headerBottom: 64, stageBottom: 900, maxScroll: 1200, bubbleHeight: 160 }
const NARROW: Omit<TourPlacementInput, 'thing'> = { window: { w: 390, h: 844 }, headerBottom: 56, stageBottom: 765, maxScroll: 1200, bubbleHeight: 200 }

const thing = (x: number, y: number, w: number, h: number, radius: number, scrolls = true): TourThing => ({ x, y, w, h, radius, scrolls })

interface Case {
  name: string
  input: TourPlacementInput
  side: string
  scroll: number | null
  bubble: [number, number]
  hole: [number, number, number, number, number]
  /** The tail's place along its edge: x on a top or bottom edge, y on a left or right one. */
  tail: number | null
}

const CASES: Case[] = [
  { name: '1440 top', input: { ...WIDE, thing: thing(24, 88, 600, 100, 0) }, side: 'top', scroll: 0, bubble: [124, 220], hole: [16, 80, 616, 116, 8], tail: 200 },
  { name: '1440 middle', input: { ...WIDE, thing: thing(24, 700, 600, 300, 14) }, side: 'top', scroll: 612, bubble: [124, 420], hole: [16, 80, 616, 316, 22], tail: 200 },
  { name: '1440 bottom', input: { ...WIDE, thing: thing(24, 1500, 600, 300, 14) }, side: 'top', scroll: 1200, bubble: [124, 632], hole: [16, 292, 616, 316, 22], tail: 200 },
  { name: '1440 taller than the window', input: { ...WIDE, thing: thing(24, 200, 900, 1400, 14) }, side: 'left', scroll: 112, bubble: [956, 96], hole: [16, 80, 916, 820, 22], tail: 60 },
  { name: '1440 in the header', input: { ...WIDE, thing: thing(1300, 12, 40, 40, 20, false) }, side: 'top', scroll: null, bubble: [1006, 84], hole: [1292, 4, 56, 56, 28], tail: 314 },
  { name: '1440 no thing', input: { ...WIDE, thing: null }, side: 'none', scroll: null, bubble: [520, 340], hole: [719, 419, 2, 2, 1], tail: null },
  { name: '390 top', input: { ...NARROW, thing: thing(14, 72, 200, 80, 0) }, side: 'top', scroll: 0, bubble: [12, 178], hole: [8, 66, 212, 92, 6], tail: 102 },
  { name: '390 middle', input: { ...NARROW, thing: thing(14, 700, 362, 260, 14) }, side: 'top', scroll: 628, bubble: [12, 358], hole: [8, 66, 374, 272, 20], tail: 183 },
  { name: '390 bottom', input: { ...NARROW, thing: thing(14, 1500, 362, 260, 14) }, side: 'top', scroll: 1200, bubble: [12, 586], hole: [8, 294, 374, 272, 20], tail: 183 },
  { name: '390 taller than the window, docked at the bottom', input: { ...NARROW, thing: thing(14, 200, 362, 1400, 14) }, side: 'top', scroll: 128, bubble: [12, 614], hole: [8, 66, 374, 699, 20], tail: 183 },
  { name: '390 in the header', input: { ...NARROW, thing: thing(270, 8, 40, 40, 20, false) }, side: 'top', scroll: null, bubble: [12, 74], hole: [264, 2, 52, 52, 26], tail: 278 },
  { name: '390 no thing', input: { ...NARROW, thing: null }, side: 'none', scroll: null, bubble: [12, 296], hole: [194, 395, 2, 2, 1], tail: null },
]

describe('placeTour: the reference\'s cases', () => {
  it.each(CASES)('$name', ({ input, side, scroll, bubble, hole, tail }) => {
    const placed = placeTour(input)

    expect(placed.side).toBe(side)
    expect(placed.scroll).toBe(scroll)
    expect([placed.bubble.x, placed.bubble.y]).toEqual(bubble)
    expect([placed.hole.x, placed.hole.y, placed.hole.w, placed.hole.h, placed.hole.radius]).toEqual(hole)
    if (tail === null) expect(placed.tail).toBeNull()
    else expect(side === 'left' || side === 'right' ? placed.tail!.y : placed.tail!.x).toBe(tail)
  })

  it('draws the ring around a thing and none around the closed hole', () => {
    expect(placeTour(CASES[0]!.input).hole.ring).toBe(3)
    expect(placeTour(CASES[5]!.input).hole.ring).toBe(0)
  })

  it('puts the tail on the bubble\'s own edge: top edge y 0, bottom edge at its height, left edge x 0', () => {
    expect(placeTour(CASES[0]!.input).tail).toMatchObject({ y: 0 })
    expect(placeTour(CASES[3]!.input).tail).toMatchObject({ x: 0 })
  })
})

describe('placeTour: invariants', () => {
  it.each(CASES)('$name: the bubble stays inside the margins and the window, the scroll inside the page', ({ input }) => {
    const placed = placeTour(input)
    const layout = input.window.w < TOUR_NARROW_BELOW ? TOUR_LAYOUT.narrow : TOUR_LAYOUT.wide
    const width = input.window.w < TOUR_NARROW_BELOW ? input.window.w - 24 : 400

    expect(placed.bubble.w).toBe(width)
    expect(placed.bubble.h).toBe(input.bubbleHeight)
    expect(placed.bubble.x).toBeGreaterThanOrEqual(layout.margin)
    expect(placed.bubble.x + width).toBeLessThanOrEqual(input.window.w - layout.margin)
    // Below the header at least: a thing in the header puts the bubble right under it, a little above the margin the others keep.
    expect(placed.bubble.y).toBeGreaterThanOrEqual(input.thing === null ? 0 : input.headerBottom)
    expect(placed.bubble.y + placed.bubble.h).toBeLessThanOrEqual(input.window.h - (input.thing === null ? 0 : layout.margin + layout.safe))
    if (placed.scroll !== null) {
      expect(placed.scroll).toBeGreaterThanOrEqual(0)
      expect(placed.scroll).toBeLessThanOrEqual(input.maxScroll)
    }
  })

  it.each(CASES.filter(({ side }) => side === 'top'))('$name: the tail never stands in the face corner', ({ input }) => {
    const placed = placeTour(input)
    const layout = input.window.w < TOUR_NARROW_BELOW ? TOUR_LAYOUT.narrow : TOUR_LAYOUT.wide

    expect(placed.tail!.x).toBeGreaterThanOrEqual(layout.faceZone + layout.tail * 0.7)
  })

  it('looks straight ahead when there is nothing to point at', () => {
    expect(placeTour(CASES[5]!.input).faceDir).toBe(0)
    expect(placeTour(CASES[5]!.input).anchor).toBeNull()
  })

  it('turns the face to the anchor: atan2 from the face centre, in degrees', () => {
    const placed = placeTour(CASES[0]!.input)
    const faceX = placed.bubble.x + TOUR_LAYOUT.wide.faceL + TOUR_LAYOUT.wide.S / 2
    const faceY = placed.bubble.y + TOUR_LAYOUT.wide.faceT + TOUR_LAYOUT.wide.S / 2

    // The anchor of an untouched thing is its centre, here (24 + 300, 88 + 50).
    expect(placed.anchor).toEqual({ x: 324, y: 138 })
    // Straight above and to the right of the face: the angle is negative (y points down) and between -90 and 0.
    expect(faceX).toBe(124 + 14 + 36)
    expect(faceY).toBe(220 - 20 + 36)
    expect(placed.faceDir).toBe(Math.round(Math.atan2(138 - 236, 324 - 174) * 180 / Math.PI))
    expect(placed.faceDir).toBeLessThan(0)
    expect(placed.faceDir).toBeGreaterThan(-90)
  })

  it('aims at an explicit anchor, which is in page coordinates like the thing', () => {
    const input: TourPlacementInput = { ...WIDE, thing: thing(24, 88, 600, 100, 0), anchor: { x: 560, y: 150 } }
    const placed = placeTour(input)

    expect(placed.anchor).toEqual({ x: 560, y: 150 })
    // The bubble is centred on the anchor, 400 wide: 560 - 200.
    expect(placed.bubble.x).toBe(360)
    expect(placed.tail!.x).toBe(200)
  })

  it('takes the anchor of a scrolling thing along with the scroll: window coordinates are page minus scroll', () => {
    const placed = placeTour({ ...WIDE, thing: thing(24, 700, 600, 300, 14), anchor: { x: 100, y: 800 } })

    expect(placed.scroll).toBe(612)
    expect(placed.anchor).toEqual({ x: 100, y: 800 - 612 })
  })

  it('does not scroll a page that cannot', () => {
    const placed = placeTour({ ...WIDE, maxScroll: 0, thing: thing(24, 700, 600, 300, 14) })

    expect(placed.scroll).toBe(0)
  })

  it('makes a thing taller than half of the usable height point 48 px below its top', () => {
    const placed = placeTour({ ...WIDE, thing: thing(24, 88, 600, 600, 14) })

    expect(placed.anchor).toEqual({ x: 324, y: 88 + 48 })
  })

  it('makes a round thing a circle: the radius is half of the hole\'s short side', () => {
    const placed = placeTour({ ...WIDE, thing: thing(1300, 12, 40, 40, 20, false) })

    expect(placed.hole.radius).toBe(28)
    expect(placed.hole.w).toBe(56)
  })

  it('keeps a thing wider than the window inside the window', () => {
    const placed = placeTour({ ...NARROW, thing: thing(-20, 72, 600, 80, 0) })

    expect(placed.bubble.x).toBe(12)
    expect(placed.bubble.x + placed.bubble.w).toBeLessThanOrEqual(390)
  })

  it.each([150, 260])('places a bubble of %i px at 390 without leaving the window', (bubbleHeight) => {
    const placed = placeTour({ ...NARROW, bubbleHeight, thing: thing(14, 700, 362, 260, 14) })

    expect(placed.bubble.h).toBe(bubbleHeight)
    expect(placed.bubble.y).toBeGreaterThanOrEqual(56 + 12)
    expect(placed.bubble.y + bubbleHeight).toBeLessThanOrEqual(844 - 12 - 18)
  })

  it('closes the hole under the bubble\'s centre, so the bubble always covers it', () => {
    const placed = placeTour({ ...WIDE, bubbleHeight: 222, thing: null })

    expect(placed.hole.x).toBe(placed.bubble.x + 200 - 1)
    expect(placed.hole.y).toBe(placed.bubble.y + 111 - 1)
    expect([placed.hole.w, placed.hole.h]).toEqual([2, 2])
  })
})

describe('the narrow width', () => {
  it('is the theme\'s sm breakpoint, 600 px', () => {
    const theme = readFileSync(resolve(import.meta.dirname, '../../app/assets/css/compies-theme.css'), 'utf8')
    const breakpoint = theme.match(/--breakpoint-sm:\s*([\d.]+)rem\s*;/)?.[1]

    expect(Number(breakpoint) * 16).toBe(TOUR_NARROW_BELOW)
  })

  it('is narrow below 600 and wide from 600 on', () => {
    const at = (w: number) => placeTour({ ...WIDE, window: { w, h: 900 }, thing: null }).bubble.w

    expect(at(599)).toBe(599 - 24)
    expect(at(600)).toBe(400)
  })
})
