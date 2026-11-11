// The Lucky Wheel's look, the Show-Rad (#519, spec #503; reference `GameWheel.dc.html`, skin `show`): the colours, the geometry of the
// rim and the places of the bulbs and pins, all in the wheel's 400 × 400 viewBox with its centre at (200, 200). Pure functions, no
// clock: LuckyWheel.vue draws from them, and the motion tickets (#521 bulbs, #522 flapper) and 0.13.3's pin ticks read the same ones.

/**
 * The wheel is a stage piece: fixed colours, the Hell values, the same in Hell and Dunkel like the coin of the Coin flip and the
 * Award ceremony's trophy. No theme token, no `currentColor` anywhere inside the disc.
 */
export const WHEEL_COLOURS = {
  ink: '#151515',
  cream: '#fffdf8',
  paper: '#fff9ef',
  red: '#ff4f4f',
  flapper: '#ffd23f',
  bulbLit: '#fff4c2',
  bulbUnlit: '#7a5a12',
} as const

/** The slices' fills, in order (reference GameWheel). */
export const WHEEL_FILLS = ['#ffd23f', '#2ec4b6', '#ff70c3', '#3a86ff'] as const

export const BULB_COUNT = 24
/** The ring the bulbs sit on, on the red band, and a bulb's radius. */
const BULB_RING_RADIUS = 190
export const BULB_RADIUS = 6
/** The ring the pins sit on, just inside the slices' edge, and a pin's radius. */
export const PIN_RING_RADIUS = 170
export const PIN_RADIUS = 5.5
/**
 * The flapper's artwork is a 44 × 58 box from the reference (px at its 440 px wheel); this places it in the 400 unit viewBox so it
 * scales with the wheel: local x 22 on the centre line, the box's top 24 reference px above the wheel, scaled by 400 / 440. The
 * hinge (22, 10) then sits at about (200, -12.7) and the tip at about (200, 27.3).
 */
export const FLAPPER_PLACEMENT = 'translate(180 -21.82) scale(0.9091)'
/** The flapper's hinge in its local box: the point its arm turns about. */
export const FLAPPER_HINGE = { x: 22, y: 10 } as const

/** A point on the wheel `degrees` clockwise from the top, `radius` from its centre: the one place of this formula. */
export function wheelPoint(degrees: number, radius: number): { x: number, y: number } {
  const radians = (degrees * Math.PI) / 180
  return { x: 200 + radius * Math.sin(radians), y: 200 - radius * Math.cos(radians) }
}

/** Where the 24 bulbs stand: the first at the top, then clockwise. */
export function bulbPoints(): { x: number, y: number }[] {
  return Array.from({ length: BULB_COUNT }, (_, index) => wheelPoint((index * 360) / BULB_COUNT, BULB_RING_RADIUS))
}

/** Which bulbs are lit at rest: every second one, the top one included (the reference's phase 0). #521 lights them by server time. */
export function restBulbs(): boolean[] {
  return Array.from({ length: BULB_COUNT }, (_, index) => index % 2 === 0)
}

/**
 * The degrees from the top, in the wheel's own frame (before the rotor turns), of every pin: the start of each slice that is wider
 * than 5 % of the even share, the reference's `w > .05` rule, so the drawn slice's pin goes once its slice has closed. This is the
 * one place the pins' positions are worked out: the flapper's kicks (#522) and 0.13.3's pin ticks call it with
 * `sliceSpans(slices, -1, 0)` to find the crossings of a spin.
 */
export function pinAngles(spans: { start: number, end: number }[]): number[] {
  const share = 360 / spans.length
  return spans.filter(span => span.end - span.start > share * 0.05).map(span => span.start)
}
