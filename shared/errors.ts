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
  /** A game's player count is not a whole number from 1 to 99, or min is above max (#142). */
  invalid_players: 400,
  /** A game's Suitabilities are unknown or repeated (#171). */
  invalid_suitabilities: 400,
  /** A game's notes are longer than GAME_NOTES_MAX characters (#223). */
  invalid_game_notes: 400,
  /** Only the creator of a game and the Platform admin may edit it (#142). */
  not_game_editor: 403,
  /** A game image is larger than GAME_IMAGE_MAX_BYTES (#143). */
  image_too_large: 413,
  /** A game image is not a WebP file (#143). */
  image_not_webp: 415,
  /** The pools of a new Event are not lists of unique game ids, or a list is longer than 200 (#146). */
  invalid_pools: 400,
  /** A game in a pool is not in the library (#146). */
  unknown_game: 400,
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
  /** The settings are missing, of the wrong type or malformed (#144). */
  invalid_settings: 400,
  /** A known Format that 1.3 cannot run yet: free-for-all (#144). */
  format_unavailable: 400,
  /** 2 to 8 teams. */
  team_count_range: 400,
  /** 1 to 6 Players per team. */
  team_size_range: 400,
  /** At most 24 Players in teams. */
  too_many_players: 400,
  /** 1 to 30 Games. */
  game_count_range: 400,
  /** The points table has the wrong length, bad values, or values that are not its preset. */
  invalid_points: 400,
  /** A place earns more points than the place above it. */
  points_rising: 400,
  /** Every place earns the same points, so the table does not rank anyone (#175). */
  points_flat: 400,
  /** A Selection mode that 1.3 cannot run yet. */
  mode_unavailable: 400,
  /** 0 to 9 Vetos per Party. */
  veto_allowance_range: 400,
  /** A hidden wheel or a Veto allowance with a Selection mode that has no wheel. */
  wheel_options_without_wheel: 400,
  /** Pool preview on together with a Hidden wheel: under a Hidden wheel nobody sees the pool (#225). */
  pool_preview_hidden_wheel: 400,
  /** The Event is running: Format, team count, points table and Selection mode no longer change (#147). */
  setting_locked: 409,
  /** A Team size below the number of Players in the fullest team (#147). */
  team_size_below_fullest: 409,
  /** A Veto allowance below the most Vetoes a Party has spent (#147). */
  veto_allowance_below_spent: 409,
  /** A Game count below the Rounds already started (#228). */
  game_count_below_started: 409,
  /** The Activity feed's `before` is not the id of an entry of this Event, or its `limit` is not a whole number from 1 to 100 (#159). */
  invalid_cursor: 400,
  /** Only the Host moves another Member on the Game board (#160). */
  host_only: 403,
  /** The id a move names is no Member of the Event (#160). */
  member_not_found: 404,
  /** The Member is in that place already (#160). */
  already_there: 409,
  /** A team the Event does not have: no settings, or a position above the team count (#160). */
  no_such_team: 400,
  /** Players move into and out of teams only once a Session has a Date (#160). */
  team_choice_closed: 409,
  /** Teams are locked for Players since the first Session started (#160, #164). */
  teams_locked: 409,
  /** The team has Team size Players; the error's data names the Player who took the last place (#160). */
  team_full: 409,
  /** A Team word with a space, or longer than TEAM_WORD_MAX characters (#161). */
  invalid_team_word: 400,
  /** Only a Player in a team has a Team word (#161). */
  not_in_team: 409,
  /** The Session has started: it is not removed, rescheduled or reopened any more (#164). */
  session_started: 409,
  /** The Event has no settings, so no Session can start (#164, start rule). */
  not_set_up: 409,
  /** A Session is running already (#164, start rule). */
  session_running: 409,
  /** No dated Session is left to start (#164, start rule). */
  no_dated_session: 409,
  /** A team has no Player (#164, start rule). */
  teams_empty: 409,
  /** The teams differ in size (#164, start rule). */
  teams_uneven: 409,
  /** No Session is running, so none can end (#164), and no game can be set (#228). */
  no_running_session: 409,
  /** The Event has started as many Rounds as its Game count: no game can be set (#228). */
  game_count_reached: 409,
  /** A Round is being drawn: no game can be set, and that Round cannot be put back (#228). */
  round_being_drawn: 409,
  /** A Round id the Event does not hold, or one that was put back already (#228). */
  round_not_found: 404,
  wrong_phase: 409,
  rate_limited: 429,
  /** This deployment has no realtime Worker (no REALTIME_URL): the client takes it as "no live connection" and polls (#156). */
  no_live_connection: 503,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS
