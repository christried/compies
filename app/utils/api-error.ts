import type { ApiErrorCode } from '~~/shared/errors'

// What a failed API call tells the UI (shared/errors.ts). `$fetch` puts the answer's statusMessage in
// `data.statusMessage`; the status code is on the error itself.

export interface ApiFailure {
  status: number | undefined
  code: string | undefined
}

export function apiFailure(failure: unknown): ApiFailure {
  const error = failure as { statusCode?: number, statusMessage?: string, data?: { statusMessage?: string } } | null
  return { status: error?.statusCode, code: error?.data?.statusMessage ?? error?.statusMessage }
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
  mode_unavailable: 'error.modeUnavailable',
  veto_allowance_range: 'error.vetoAllowanceRange',
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
