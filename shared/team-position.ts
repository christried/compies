// The Team position clamp, a leaf: `team-colors.ts` and `team-marks.ts` (which the Share renderer imports) read it, and it imports nothing, so
// the Share renderer does not pull in `settings.ts` and what that imports (#366, review 0.10 Q13).

/** The most Teams an Event has (the settings rules in `settings.ts` read it from here). */
export const TEAM_COUNT_MAX = 8

/** A Team position clamped to 1..TEAM_COUNT_MAX, the one clamp the Team colours, symbols and TeamMark read (#329). */
export function teamPosition(position: number): number {
  return Math.max(1, Math.min(TEAM_COUNT_MAX, Math.round(position)))
}
