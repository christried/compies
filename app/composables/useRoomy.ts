/**
 * Whether the screen is `md` or wider: the Award ceremony's wide sizes and layout (#309, #315). `false` until the browser was asked
 * (useMediaQuery is `null` there), so a caller never writes `=== true` (#328: one breakpoint for the stage and the layer; #366: one boolean).
 */
export function useRoomy() {
  const matches = useMediaQuery('(min-width: 48rem)')
  return computed(() => matches.value === true)
}
