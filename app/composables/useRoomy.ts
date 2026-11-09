/**
 * Whether the screen is `md` or wider: the Award ceremony's wide sizes and layout (#309, #315). `null` until the browser was asked,
 * as useMediaQuery (#328: one breakpoint for the stage and the layer).
 */
export function useRoomy() {
  return useMediaQuery('(min-width: 48rem)')
}
