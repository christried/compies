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

// The settings rules (#144). The stepper and the server both use them; the server stores what parseSettings returns.

export const TEAM_COUNT_MIN = 2
export const TEAM_COUNT_MAX = 8
export const TEAM_SIZE_MIN = 1
export const TEAM_SIZE_MAX = 6
/** At most this many Players in teams (team count × Team size). */
export const TEAM_PLAYERS_MAX = 24
export const GAME_COUNT_MIN = 1
export const GAME_COUNT_MAX = 30
export const GAME_COUNT_DEFAULT = 10
export const VETO_ALLOWANCE_MIN = 0
export const VETO_ALLOWANCE_MAX = 9
/** Highest points one place can earn (UI sanity cap). */
export const POINTS_MAX = 99
/** Formats and Selection modes that can be chosen in 1.3; the others are „Bald verfügbar“. */
export const AVAILABLE_FORMATS: readonly Format[] = ['teams']
export const AVAILABLE_SELECTION_MODES: readonly SelectionMode[] = ['lucky_wheel', 'admin_pick']

/** An Event's settings once set up (all-null columns = not set up → `null` everywhere in code). */
export interface EventSettings {
  /** Always `teams` in 1.3. */
  format: Format
  teamCount: number
  teamSize: number
  gameCount: number
  pointsTable: PointsTable
  selectionMode: SelectionMode
  /** Only with `lucky_wheel`; false otherwise. */
  hiddenWheel: boolean
  /** Vetoes per Party; only with `lucky_wheel`, null otherwise. */
  vetoAllowance: number | null
}

export type SettingsError
  = 'invalid_settings' // missing / wrong type / unknown enum value / malformed
    | 'format_unavailable' // a known Format that 1.3 can't run (ffa)
    | 'team_count_range' | 'team_size_range' | 'too_many_players'
    | 'game_count_range'
    | 'invalid_points' // wrong length (≠ team count), non-integer, negative, > POINTS_MAX, preset values don't match the preset
    | 'points_rising' // a place earns more than the place above
    | 'mode_unavailable' // pick_ban, losers_pick, losers_advantage
    | 'veto_allowance_range'
    | 'wheel_options_without_wheel' // hiddenWheel true or vetoAllowance set with a mode other than lucky_wheel

/** The Veto allowance a Lucky Wheel starts with: at least 3, or one per Player of a team. */
export function defaultVetoAllowance(teamSize: number): number {
  return Math.max(3, teamSize)
}

/** One point fewer per place, last place 0: [n-1, …, 1, 0]. */
export function linearPoints(teamCount: number): number[] {
  return Array.from({ length: teamCount }, (_, place) => teamCount - 1 - place)
}

/** The first place gets what linear gives it, everyone else 0: [n-1, 0, …, 0]. */
export function winnerTakesAllPoints(teamCount: number): number[] {
  return Array.from({ length: teamCount }, (_, place) => (place === 0 ? teamCount - 1 : 0))
}

/** The table for a preset at this team count; `custom` resizes the given values (cut, or pad with 0). */
export function pointsFor(preset: PointsPreset, teamCount: number, custom: number[] = []): number[] {
  if (preset === 'linear') return linearPoints(teamCount)
  if (preset === 'winner_takes_all') return winnerTakesAllPoints(teamCount)
  return Array.from({ length: teamCount }, (_, place) => custom[place] ?? 0)
}

/** The 1-based place that earns more than the place above it, or null (for „Platz 3 kann nicht mehr Punkte bekommen als Platz 2.“). */
export function risingPlace(values: number[]): number | null {
  for (let place = 1; place < values.length; place++) {
    if (values[place]! > values[place - 1]!) return place + 1
  }
  return null
}

/** Defaults for a new Event: 2 teams × 3 (a 3v3), Game count 10, linear, Admin pick, visible wheel, no Veto allowance. */
export function defaultSettings(): EventSettings {
  return {
    format: 'teams',
    teamCount: 2,
    teamSize: 3,
    gameCount: GAME_COUNT_DEFAULT,
    pointsTable: { preset: 'linear', values: linearPoints(2) },
    selectionMode: 'admin_pick',
    hiddenWheel: false,
    vetoAllowance: null,
  }
}

/** The settings after the teams change: a preset points table follows the team count, a custom one is cut or padded with 0 (#144). */
export function withTeams(settings: EventSettings, teamCount: number, teamSize: number): EventSettings {
  const { preset, values } = settings.pointsTable
  return { ...settings, teamCount, teamSize, pointsTable: { preset, values: pointsFor(preset, teamCount, values) } }
}

/** Recommended Game pool size: Game count + Veto allowance × team count for the Lucky Wheel; the Game count otherwise (#146 shows it). */
export function recommendedPoolSize(settings: Pick<EventSettings, 'gameCount' | 'teamCount' | 'selectionMode' | 'vetoAllowance'>): number {
  if (settings.selectionMode !== 'lucky_wheel') return settings.gameCount
  return settings.gameCount + (settings.vetoAllowance ?? 0) * settings.teamCount
}

type Parsed = { ok: true, settings: EventSettings } | { ok: false, error: SettingsError }

function fail(error: SettingsError): Parsed {
  return { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

/**
 * Validates a full settings payload (create, and „Event einrichten“ in #147). Names the first broken rule, in
 * the order Format, teams, Game count, points table, Selection mode, wheel options.
 */
export function parseSettings(input: unknown): Parsed {
  if (!isRecord(input)) return fail('invalid_settings')

  const { format, teamCount, teamSize, gameCount, pointsTable, selectionMode } = input
  if (!oneOf(FORMATS, format)) return fail('invalid_settings')
  if (!oneOf(AVAILABLE_FORMATS, format)) return fail('format_unavailable')

  if (!isInt(teamCount)) return fail('invalid_settings')
  if (teamCount < TEAM_COUNT_MIN || teamCount > TEAM_COUNT_MAX) return fail('team_count_range')
  if (!isInt(teamSize)) return fail('invalid_settings')
  if (teamSize < TEAM_SIZE_MIN || teamSize > TEAM_SIZE_MAX) return fail('team_size_range')
  if (teamCount * teamSize > TEAM_PLAYERS_MAX) return fail('too_many_players')

  if (!isInt(gameCount)) return fail('invalid_settings')
  if (gameCount < GAME_COUNT_MIN || gameCount > GAME_COUNT_MAX) return fail('game_count_range')

  if (!isRecord(pointsTable) || !oneOf(POINTS_PRESETS, pointsTable.preset) || !Array.isArray(pointsTable.values)) return fail('invalid_settings')
  const preset = pointsTable.preset
  const values: unknown[] = pointsTable.values
  if (values.length !== teamCount || !values.every(value => isInt(value) && value >= 0 && value <= POINTS_MAX)) return fail('invalid_points')
  const points = values as number[]
  if (preset === 'custom') {
    if (risingPlace(points) !== null) return fail('points_rising')
  }
  else if (points.some((value, place) => value !== pointsFor(preset, teamCount)[place])) {
    return fail('invalid_points')
  }

  if (!oneOf(SELECTION_MODES, selectionMode)) return fail('invalid_settings')
  if (!oneOf(AVAILABLE_SELECTION_MODES, selectionMode)) return fail('mode_unavailable')

  const base = { format, teamCount, teamSize, gameCount, pointsTable: { preset, values: points }, selectionMode }
  const { hiddenWheel, vetoAllowance } = input
  if (selectionMode !== 'lucky_wheel') {
    if ((hiddenWheel !== undefined && hiddenWheel !== false) || (vetoAllowance !== undefined && vetoAllowance !== null)) return fail('wheel_options_without_wheel')
    return { ok: true, settings: { ...base, hiddenWheel: false, vetoAllowance: null } }
  }

  if (hiddenWheel !== undefined && typeof hiddenWheel !== 'boolean') return fail('invalid_settings')
  // An absent or null allowance means „not chosen“: the default applies.
  if (vetoAllowance === undefined || vetoAllowance === null) {
    return { ok: true, settings: { ...base, hiddenWheel: hiddenWheel ?? false, vetoAllowance: defaultVetoAllowance(teamSize) } }
  }
  if (!isInt(vetoAllowance)) return fail('invalid_settings')
  if (vetoAllowance < VETO_ALLOWANCE_MIN || vetoAllowance > VETO_ALLOWANCE_MAX) return fail('veto_allowance_range')
  return { ok: true, settings: { ...base, hiddenWheel: hiddenWheel ?? false, vetoAllowance } }
}

/** Settings from the stored columns; null when the Event is not set up (any required column null). */
export function settingsFromRow(row: {
  format: Format | null
  teamCount: number | null
  teamSize: number | null
  gameCount: number | null
  pointsTable: PointsTable | null
  selectionMode: SelectionMode | null
  hiddenWheel: boolean | null
  vetoAllowance: number | null
}): EventSettings | null {
  const { format, teamCount, teamSize, gameCount, pointsTable, selectionMode } = row
  if (format === null || teamCount === null || teamSize === null || gameCount === null || pointsTable === null || selectionMode === null) return null
  return { format, teamCount, teamSize, gameCount, pointsTable, selectionMode, hiddenWheel: row.hiddenWheel ?? false, vetoAllowance: row.vetoAllowance }
}
