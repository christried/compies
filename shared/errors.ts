// The error contract of the Event API (#1 § URLs and API). A refused request answers with an HTTP
// status and one of these codes as its statusMessage; the UI turns the code into copy
// (app/utils/api-error.ts). Links that lead nowhere keep their generic wording instead ("Event not
// found", "Event deleted"), because every such link must look the same (ADR 0006).

export const API_ERROR_STATUS = {
  invalid_name: 400,
  invalid_mode: 400,
  invalid_slots: 400,
  invalid_time: 400,
  invalid_value: 400,
  in_past: 400,
  slot_past: 400,
  duplicate_slot: 400,
  slots_max: 400,
  /** The User is a Member, but only the Host of this Event may do this. */
  not_host: 403,
  /** Creating an Event needs the Host permission (ADR 0002). */
  no_host_permission: 403,
  wrong_phase: 409,
  rate_limited: 429,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS
