import { teamPosition } from './team-position'

/** Circle, triangle, square, diamond, cross, bar, arc, star: one 24-box symbol path per Team colour (TeamMark.dc.html). TeamMark.vue and the Share image draw the same strings (#313). */
export const TEAM_SYMBOLS: readonly string[] = [
  'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z',
  'M12 3.5 21 19.5H3Z',
  'M5 5h14v14H5Z',
  'M12 2.5 21.5 12 12 21.5 2.5 12Z',
  'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
  'M3 8.5h18v7H3Z',
  'M3 17a9 9 0 0 1 18 0Z',
  'M12 2 14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z',
]

/** The symbol path of a Team position, clamped as TeamMark does (`teamPosition`). */
export function teamSymbol(position: number): string {
  return TEAM_SYMBOLS[teamPosition(position) - 1]!
}
