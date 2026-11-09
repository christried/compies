// The Team colour as CSS (DS People, 02-components § TeamChip, TeamMark, TeamZone; #328): the tokens `--cp-team-N`, `--cp-team-N-pattern` and
// `--cp-team-N-ink`. This is the one place that spells them; a surface reads them through here, so a token's name changes once.

/** A Team colour token as a CSS value: `var(--cp-team-3)`, `var(--cp-team-3-pattern)` or `var(--cp-team-3-ink)`. */
export function teamVar(team: number, token?: 'pattern' | 'ink'): string {
  return token ? `var(--cp-team-${team}-${token})` : `var(--cp-team-${team})`
}

/** A surface in a Team colour: the colour, its pattern over it, and the ink for the text on it (a card's strip, a place's swatch). */
export function teamSurfaceStyle(team: number): { backgroundColor: string, backgroundImage: string, color: string } {
  return { backgroundColor: teamVar(team), backgroundImage: teamVar(team, 'pattern'), color: teamVar(team, 'ink') }
}
