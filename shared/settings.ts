// Event settings (#138, release 1.3): the values the stepper, the settings rules and the schema share.

import { beforeFinish, type Phase } from './event'
import { isRecord } from './record'

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
    | 'points_flat' // every place earns the same (#175)
    | 'mode_unavailable' // pick_ban, losers_pick, losers_advantage
    | 'veto_allowance_range'
    | 'wheel_options_without_wheel' // hiddenWheel true or vetoAllowance set with a mode other than lucky_wheel

/** Whether the Selection mode spins a Lucky Wheel: only then the Hidden wheel and the Veto allowance apply. 1.5/1.6 modes add their own branches here. */
export function hasWheel(mode: SelectionMode): boolean {
  return mode === 'lucky_wheel'
}

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

/** Two or more places and every one earns what the first place earns: the table does not rank anyone (#175). */
export function isFlat(values: number[]): boolean {
  return values.length >= 2 && values.every(value => value === values[0])
}

/** Defaults for a new Event: 2 teams × 3 (a 3v3), Game count 10, linear, Host pick (`admin_pick`), visible wheel, no Veto allowance. */
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
export function withTeams<S extends Pick<EventSettings, 'teamCount' | 'teamSize' | 'pointsTable'>>(settings: S, teamCount: number, teamSize: number): S {
  const { preset, values } = settings.pointsTable
  return { ...settings, teamCount, teamSize, pointsTable: { preset, values: pointsFor(preset, teamCount, values) } }
}

/** Recommended Game pool size: Game count + Veto allowance × team count for the Lucky Wheel; the Game count otherwise (#146 shows it). */
export function recommendedPoolSize(settings: Pick<EventSettings, 'gameCount' | 'teamCount' | 'selectionMode' | 'vetoAllowance'>): number {
  if (!hasWheel(settings.selectionMode)) return settings.gameCount
  return settings.gameCount + (settings.vetoAllowance ?? 0) * settings.teamCount
}

/**
 * The hint under the Game pool (#146): null while the pool has the recommended size, else the numbers behind
 * „Wird knapp“. `vetoes` are the vetoes of all Parties on the Lucky Wheel (Veto allowance × team count), 0 otherwise.
 * It never blocks anything.
 */
export function poolHint(
  settings: Pick<EventSettings, 'gameCount' | 'teamCount' | 'selectionMode' | 'vetoAllowance'>,
  poolSize: number,
): null | { games: number, vetoes: number, needed: number, have: number } {
  const needed = recommendedPoolSize(settings)
  if (poolSize >= needed) return null
  return { games: settings.gameCount, vetoes: needed - settings.gameCount, needed, have: poolSize }
}

type Parsed = { ok: true, settings: EventSettings } | { ok: false, error: SettingsError }

function fail(error: SettingsError): Parsed {
  return { ok: false, error }
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
    // Presets always give first place more than last, so only a custom table can be flat (#175).
    if (isFlat(points)) return fail('points_flat')
  }
  else if (points.some((value, place) => value !== pointsFor(preset, teamCount)[place])) {
    return fail('invalid_points')
  }

  if (!oneOf(SELECTION_MODES, selectionMode)) return fail('invalid_settings')
  if (!oneOf(AVAILABLE_SELECTION_MODES, selectionMode)) return fail('mode_unavailable')

  const base = { format, teamCount, teamSize, gameCount, pointsTable: { preset, values: points }, selectionMode }
  const { hiddenWheel, vetoAllowance } = input
  if (!hasWheel(selectionMode)) {
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

/** The Hidden wheel of a stored row: a null counts as hidden, so a row that lost the value never shows a pool it should hide (N11). */
export function storedHiddenWheel(stored: boolean | null): boolean {
  return stored ?? true
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
  return { format, teamCount, teamSize, gameCount, pointsTable, selectionMode, hiddenWheel: storedHiddenWheel(row.hiddenWheel), vetoAllowance: row.vetoAllowance }
}

// Changing the settings of an Event that exists (#147).

/** Settings that stay fixed once the first Session has started (spec): games already played keep their rules. */
export const LOCKED_WHEN_RUNNING = ['format', 'teamCount', 'pointsTable', 'selectionMode'] as const

/** Phase running or later: the first Session has started. */
export function settingsLocked(phase: Phase): boolean {
  return phase === 'running' || phase === 'finished' || phase === 'archived'
}

/** Settings can change in every Phase before the Event is finished. */
export function settingsEditable(phase: Phase): boolean {
  return beforeFinish(phase)
}

/** The lowest values the Event allows now: Team size never below the fullest team, Veto allowance never below the most Vetoes a Party has spent. */
export interface SettingsFloors {
  teamSize: number
  vetoAllowance: number
}

export type SettingsChangeError = SettingsError | 'setting_locked' | 'team_size_below_fullest' | 'veto_allowance_below_spent' | 'wrong_phase'

/**
 * The change put over the current settings, ready for parseSettings. Wheel values left over from the Lucky Wheel (from
 * `current`) never fail a Host pick Event, so they are dropped; ones the change itself sends stay and do fail, as on create.
 */
export function mergeSettings(current: EventSettings, change: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current, ...change }
  if (merged.selectionMode === 'admin_pick') {
    if (!('hiddenWheel' in change)) delete merged.hiddenWheel
    if (!('vetoAllowance' in change)) delete merged.vetoAllowance
  }
  return merged
}

/**
 * Checks a change of an Event's settings. `current` null = not set up: the change must then be a full payload (parseSettings).
 * Otherwise the change is merged over `current` (only keys present in `change`), then: wrong_phase when the Phase is not
 * settingsEditable; in a settingsLocked Phase any LOCKED_WHEN_RUNNING key whose value differs → setting_locked; then
 * parseSettings on the merged settings; then the floors.
 */
export function checkSettingsChange(
  current: EventSettings | null,
  change: unknown,
  context: { phase: Phase, floors: SettingsFloors },
): { ok: true, settings: EventSettings } | { ok: false, error: SettingsChangeError } {
  if (!settingsEditable(context.phase)) return { ok: false, error: 'wrong_phase' }
  if (!isRecord(change)) return { ok: false, error: 'invalid_settings' }

  let merged: Record<string, unknown> = change
  if (current !== null) {
    if (settingsLocked(context.phase) && LOCKED_WHEN_RUNNING.some(key => key in change && !sameValue(change[key], current[key]))) {
      return { ok: false, error: 'setting_locked' }
    }
    merged = mergeSettings(current, change)
  }

  const parsed = parseSettings(merged)
  if (!parsed.ok) return parsed
  const { settings } = parsed
  if (settings.teamSize < context.floors.teamSize) return { ok: false, error: 'team_size_below_fullest' }
  if (settings.vetoAllowance !== null && settings.vetoAllowance < context.floors.vetoAllowance) return { ok: false, error: 'veto_allowance_below_spent' }
  return parsed
}

/**
 * The settings whose value differs between `before` and `after` (#183). `before` null = the Event was not set up, so
 * every setting is new. The activity feed writes its "Game count changed" lines from this (#159).
 */
export function changedKeys(before: EventSettings | null, after: EventSettings): (keyof EventSettings)[] {
  const keys = Object.keys(after) as (keyof EventSettings)[]
  return before === null ? keys : keys.filter(key => !sameValue(before[key], after[key]))
}

/** Same value; a points table counts as the same with the same preset and places, whatever its key order. */
function sameValue(a: unknown, b: unknown): boolean {
  if (isRecord(a) && isRecord(b)) return sameValue(a.preset, b.preset) && sameValue(a.values, b.values)
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => value === b[index])
  return a === b
}

/** Whether an Event may start a Session: it needs settings. Kept for 1.4, which enforces it at Session start; only its unit test calls it today. */
export function canStartSession(settings: EventSettings | null): boolean {
  return settings !== null
}
