// The error contract of the Event API (#1 § URLs and API). A refused request answers with an HTTP
// status and one of these codes as its statusMessage; the UI turns the code into copy
// (app/utils/api-error.ts). Links that lead nowhere keep their generic wording instead ("Event not
// found", "Event deleted"), because every such link must look the same (ADR 0006).

export const API_ERROR_STATUS = {
  invalid_name: 400,
  invalid_mode: 400,
  invalid_sessions: 400,
  invalid_slots: 400,
  invalid_time: 400,
  invalid_value: 400,
  /** A Note on a Vote is longer than NOTE_MAX characters (#102). */
  note_too_long: 400,
  /** A game name is empty or longer than GAME_NAME_MAX characters (#141). */
  invalid_game_name: 400,
  /** A game's YouTube link is not a link to a video (#141). */
  invalid_youtube: 400,
  /** A game's clip start or length is not a whole number in range (#141). */
  invalid_clip: 400,
  /** Only the creator of a game and the Platform admin may edit it (#142). */
  not_game_editor: 403,
  /** A game image is larger than GAME_IMAGE_MAX_BYTES (#143). */
  image_too_large: 413,
  /** A game image is not a WebP file (#143). */
  image_not_webp: 415,
  too_few_slots: 400,
  in_past: 400,
  slot_past: 400,
  /** The Slot became a Session's Date: it is no longer open, and its Votes are frozen (#52). */
  slot_taken: 409,
  duplicate_slot: 400,
  duplicate_date: 400,
  slots_max: 400,
  /** An Event has at most 8 Sessions (#55). */
  sessions_max: 400,
  /** The last Session of an Event cannot be removed (#55). */
  last_session: 409,
  /** The User is a Member, but only the Host of this Event may do this. */
  not_host: 403,
  /** Creating an Event needs the Host permission (ADR 0002). */
  no_host_permission: 403,
  wrong_phase: 409,
  rate_limited: 429,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS
