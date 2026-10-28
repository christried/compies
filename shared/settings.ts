// Event settings (#138, release 1.3): the values the stepper, the settings rules and the schema share.

/** Formats (GLOSSARY: Format). Only `teams` can be chosen in 1.3; `ffa` is shown „Bald verfügbar“. */
export const FORMATS = ['teams', 'ffa'] as const
export type Format = (typeof FORMATS)[number]

/** Selection modes (GLOSSARY: Selection mode). 1.3 offers `lucky_wheel` and `admin_pick`; the rest are „Bald verfügbar“. */
export const SELECTION_MODES = ['lucky_wheel', 'admin_pick', 'pick_ban', 'losers_pick', 'losers_advantage'] as const
export type SelectionMode = (typeof SELECTION_MODES)[number]

/** Points table presets (brief §5). */
export const POINTS_PRESETS = ['linear', 'winner_takes_all', 'custom'] as const
export type PointsPreset = (typeof POINTS_PRESETS)[number]

/** Points per place, first place first, one entry per team, stored with the preset it came from. */
export interface PointsTable {
  preset: PointsPreset
  values: number[]
}

/** The two pools of an Event (GLOSSARY: Game pool, Tiebreaker pool). A game may sit in both. */
export const POOLS = ['main', 'tiebreaker'] as const
export type Pool = (typeof POOLS)[number]
