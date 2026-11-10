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

/** The shared words of every reason. `null` = no words on purpose: the caller's fallback shows (the nine codes at the end). The Record is total, so a new ApiErrorCode fails typecheck until it is worded or set to null here. */
const SHARED: Record<ApiErrorCode, string | null> = {
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
  invalid_tags: 'error.tagsInvalid',
  invalid_price: 'error.priceInvalid',
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
  no_such_team: 'error.noSuchTeam', // by a race only: the Host lowers the team count under an open board (#421)
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
  wrong_phase: 'error.wrongPhase',
  results_missing: 'error.resultsMissing',
  standings_changed: 'error.standingsChanged',
  no_tie: 'error.noTie',
  game_count_reached: 'dock.setBlocked.game_count_reached',
  round_being_drawn: 'dock.setBlocked.round_being_drawn',
  not_a_player: 'error.notAPlayer',
  no_veto_window: 'error.noVetoWindow',
  veto_window_closed: 'error.vetoWindowClosed',
  veto_already_cast: 'error.vetoUsed',
  no_vetoes_left: 'error.noVetosLeft',
  locked_while_drawn: 'error.lockedWhileDrawn',
  game_already_drawn: 'error.gameAlreadyDrawn',
  no_wheel: 'dock.setBlocked.no_wheel',
  pool_empty: 'dock.setBlocked.pool_empty',
  bonus_veto_limit: 'error.bonusVetoLimit',
  no_clip: 'error.noClip',
  round_not_found: 'error.roundNotFound',
  game_count_below_started: 'error.gameCountBelowStarted',
  no_countdown: 'error.noCountdown',
  countdown_running: 'error.countdownRunning',
  countdown_not_running: 'error.countdownNotRunning',
  countdown_ended: 'error.countdownEnded',
  coin_in_air: 'error.coinInAir',
  ceremony_running: 'error.ceremonyRunning',
  ceremony_pending: 'error.ceremonyPending',
  round_not_open: 'error.roundNotOpen',
  invalid_result: 'error.resultInvalid',
  // The nine codes without words, each an intended fallback to the caller's line (#417): none is reached by a normal click.
  invalid_name: null, // create parser; the setup wizard validates the name first
  invalid_mode: null, // create parser; the wizard validates the date mode first
  invalid_slots: null, // create parser; the wizard validates the slots first
  invalid_time: null, // a malformed value only; the Slot editor has its own words (screen slotEditor), the wizard validates
  invalid_value: null, // fixed shapes from the client; a vote falls back to error.voteFailed by its own fallback
  invalid_settings: null, // the editor sends a complete draft
  wheel_options_without_wheel: null, // only a draft with wheel options in a mode without a wheel: a defensive refusal
  invalid_cursor: null, // the Activity feed's cursor is the id the client was given
  no_live_connection: null, // never copy: useEventRoom takes it as no live connection and polls
}

/** Words that differ from SHARED on one screen, as data. Each entry says where it shows. */
const SCREENS = {
  /** „Letztes Spiel hinzufügen“: its disabled reason and its toast (#278). */
  lastGame: { game_count_range: 'dock.lastGameBlocked.game_count_range' },
  /** „Event löschen“ (#333): its disabled reason and the toast of a refused delete. */
  deleteEvent: { session_running: 'dock.deleteBlocked' },
  /** The toasts of the Slot editor sheet (SlotEditSheet). */
  slotEditor: { invalid_time: 'mvp.slots.incomplete', wrong_phase: 'mvp.slots.locked' },
  /** The inline row error of the setup wizard's direct-dates mode: two Sessions on one Date is the Date rule, not a duplicate Slot (StepSessions). */
  directDates: { duplicate_slot: 'error.dateDuplicate' },
  /** The failure line of the settings editor (einstellungen.vue). */
  eventSettings: { wrong_phase: 'eventSettings.wrongPhase' },
} as const satisfies Record<string, Partial<Record<ApiErrorCode, string>>>

/** The screen a reason shows on, where it is worded differently from the shared words (not a Place: GLOSSARY). Absent (undefined) = the shared words. */
export type ReasonScreen = keyof typeof SCREENS

const FALLBACK = 'error.saveFailed'

function words(code: string, screen?: ReasonScreen): string | null | undefined {
  const own: Partial<Record<ApiErrorCode, string>> = screen === undefined ? {} : SCREENS[screen]
  return own[code as ApiErrorCode] ?? SHARED[code as ApiErrorCode] // undefined for a code the contract does not know
}

/** The i18n key of a rule's reason on a screen. A code without words answers 'error.saveFailed' (the nine nulls of SHARED). */
export function reasonKey(code: ApiErrorCode, screen?: ReasonScreen): string {
  return words(code, screen) ?? FALLBACK
}

/** The i18n key of a failed call: the failure's code on `screen`, else `fallback`. Placeholders such as `{max}` are the caller's to fill. */
export function apiErrorKey(failure: unknown, fallback = FALLBACK, screen?: ReasonScreen): string {
  const code = apiFailure(failure).code
  return (code ? words(code, screen) : null) ?? fallback
}
