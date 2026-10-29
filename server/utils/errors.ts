import { createError } from 'h3'
import { API_ERROR_STATUS, type ApiErrorCode } from '../../shared/errors'

// The answers a refused Event request gets (shared/errors.ts, #1 § URLs and API).

/** A refusal with its code as the statusMessage, which the UI maps to copy. `data` adds facts the UI names (a lost race's winner). */
export function apiError(code: ApiErrorCode, data?: Record<string, string>) {
  return createError({ statusCode: API_ERROR_STATUS[code], statusMessage: code, data })
}

/** The Member id a move names is no Member of the Event (#160). */
export function memberNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Member not found' })
}

/** The answer a missing API resource gets, JSON like every other API answer (review Spec F2). */
export function apiNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Not Found' })
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

/** A Session id that the Event does not hold (#53). */
export function sessionNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Session not found' })
}
