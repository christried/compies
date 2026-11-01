import type { ApiErrorCode } from '~~/shared/errors'
import { isRecord } from '~~/shared/record'

// What a failed API call tells the UI (shared/errors.ts). `$fetch` puts the answer's statusMessage in
// `data.statusMessage`; the status code is on the error itself.

export interface ApiFailure {
  status: number | undefined
  code: string | undefined
  /** The payload the server sent with the refusal (`apiError`'s `data`, e.g. the `winnerId` of a lost race), when it is an object (#237). */
  data: Record<string, unknown> | undefined
}

export function apiFailure(failure: unknown): ApiFailure {
  const error = failure as { statusCode?: number, statusMessage?: string, data?: { statusMessage?: string, data?: unknown } } | null
  const data = error?.data?.data
  return { status: error?.statusCode, code: error?.data?.statusMessage ?? error?.statusMessage, data: isRecord(data) ? data : undefined }
}

/** The copy for each error code the UI can explain. Codes not listed fall back to the caller's copy. */
const CODE_COPY: Partial<Record<ApiErrorCode, string>> = {
  in_past: 'error.slotPast',
  slot_past: 'error.slotPast',
  slot_taken: 'error.slotTakenDate',
  duplicate_slot: 'error.slotDuplicate',
  duplicate_date: 'error.dateDuplicate',
  too_few_slots: 'error.tooFewSlots',
  invalid_sessions: 'error.sessionsInvalid',
  sessions_max: 'error.sessionsMax',
  last_session: 'error.lastSession',
  slots_max: 'error.slotsMax',
  not_host: 'error.forbidden',
  no_host_permission: 'error.noHostRight',
  rate_limited: 'error.rateLimited',
  note_too_long: 'error.noteTooLong',
  format_unavailable: 'error.formatUnavailable',
  team_count_range: 'error.teamCountRange',
  team_size_range: 'error.teamSizeRange',
  too_many_players: 'error.tooManyPlayers',
  game_count_range: 'error.gameCountRange',
  invalid_points: 'error.pointsInvalid',
  points_rising: 'error.pointsOrder',
  points_flat: 'error.pointsFlat',
  mode_unavailable: 'error.modeUnavailable',
  veto_allowance_range: 'error.vetoAllowanceRange',
  pool_preview_hidden_wheel: 'error.poolPreviewHiddenWheel',
  invalid_game_name: 'error.gameNameInvalid',
  invalid_youtube: 'gameEdit.badLink',
  invalid_clip: 'error.clipInvalid',
  invalid_players: 'error.playersInvalid',
  invalid_suitabilities: 'error.suitabilitiesInvalid',
  invalid_game_notes: 'error.gameNotesInvalid',
  not_game_editor: 'error.notGameEditor',
  image_too_large: 'error.imageTooLarge',
  image_not_webp: 'error.imageNotWebp',
  invalid_pools: 'error.poolsInvalid',
  unknown_game: 'error.unknownGame',
  setting_locked: 'error.settingLocked',
  team_size_below_fullest: 'error.teamSizeBelowFullest',
  veto_allowance_below_spent: 'error.vetoAllowanceBelowSpent',
  host_only: 'board.reason.hostOnly',
  member_not_found: 'error.memberNotFound',
  already_there: 'board.reason.already',
  team_choice_closed: 'board.reason.pollLocked',
  teams_locked: 'board.reason.runningLocked',
  team_full: 'board.reason.full',
  invalid_team_word: 'team.word.noSpaces',
  not_in_team: 'team.word.noTeam',
  session_started: 'error.sessionStarted',
  not_set_up: 'dock.startBlocked.not_set_up',
  session_running: 'dock.startBlocked.session_running',
  no_dated_session: 'dock.startBlocked.no_dated_session',
  teams_empty: 'dock.startBlocked.teams_empty',
  teams_uneven: 'dock.startBlocked.teams_uneven',
  no_running_session: 'error.noRunningSession',
  game_count_reached: 'dock.setBlocked.game_count_reached',
  round_being_drawn: 'dock.setBlocked.round_being_drawn',
  not_a_player: 'error.notAPlayer',
  no_veto_window: 'error.noVetoWindow',
  veto_window_closed: 'error.vetoWindowClosed',
  veto_already_cast: 'error.vetoUsed',
  no_vetoes_left: 'error.noVetosLeft',
  hidden_wheel_locked: 'error.hiddenWheelLocked',
  no_wheel: 'dock.setBlocked.no_wheel',
  pool_empty: 'dock.setBlocked.pool_empty',
  round_not_found: 'error.roundNotFound',
  game_count_below_started: 'error.gameCountBelowStarted',
  no_countdown: 'error.noCountdown',
  countdown_running: 'error.countdownRunning',
  countdown_not_running: 'error.countdownNotRunning',
  countdown_ended: 'error.countdownEnded',
}

/** The i18n key for an error code: the screen's own key if it has one, else the shared one, else `fallback`. */
export function errorCopyKey(code: ApiErrorCode, overrides: Partial<Record<ApiErrorCode, string>> = {}, fallback = 'error.saveFailed'): string {
  return overrides[code] ?? CODE_COPY[code] ?? fallback
}

/**
 * The i18n key for a failed call: the screen's own key for a code if it has one, else the shared one,
 * else `fallback`. Placeholders such as `{max}` are the caller's to fill.
 */
export function apiErrorKey(failure: unknown, fallback = 'error.saveFailed', overrides: Partial<Record<ApiErrorCode, string>> = {}): string {
  const code = apiFailure(failure).code as ApiErrorCode | undefined
  return code ? errorCopyKey(code, overrides, fallback) : fallback
}
