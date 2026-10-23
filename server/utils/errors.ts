import { createError } from 'h3'
import { API_ERROR_STATUS, type ApiErrorCode } from '../../shared/errors'

// The answers a refused Event request gets (shared/errors.ts, #1 § URLs and API).

/** A refusal with its code as the statusMessage, which the UI maps to copy. */
export function apiError(code: ApiErrorCode) {
  return createError({ statusCode: API_ERROR_STATUS[code], statusMessage: code })
}

/** The generic answer for every link that does not lead to a live Event (ADR 0006). */
export function eventNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Event not found' })
}

/** Only a former Member of a deleted Event learns that it was deleted (#10). */
export function eventDeleted() {
  return createError({ statusCode: 410, statusMessage: 'Event deleted' })
}

export function slotNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Slot not found' })
}
