// The eight Team colours as hex, for places that cannot read CSS variables: the Share image is drawn on the server in the light
// look (#313). The tokens in `compies-tokens.css` (`--cp-team-N`, `-ink`) stay the source; `team-colors.test.ts` keeps this equal to them.
import { teamPosition } from './settings'

/** The light look's surface (`--cp-surface`, cards and panels): the ink on the two dark Team colours, the Share image's card, and its chip of a game nobody won. */
export const SURFACE = '#fffdf8'

export const TEAM_COLORS: readonly { fill: string, ink: string }[] = [
  { fill: '#e4572e', ink: '#151515' },
  { fill: '#f0a202', ink: '#151515' },
  { fill: '#f3e04a', ink: '#151515' },
  { fill: '#56b4e9', ink: '#151515' },
  { fill: '#009e73', ink: '#151515' },
  { fill: '#0072b2', ink: SURFACE },
  { fill: '#cc79a7', ink: '#151515' },
  { fill: '#3d2d8f', ink: SURFACE },
]

/** The colours of a Team position, clamped as TeamMark does (`teamPosition`). */
export function teamColor(position: number): { fill: string, ink: string } {
  return TEAM_COLORS[teamPosition(position) - 1]!
}
