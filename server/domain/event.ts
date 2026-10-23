import { EVENT_NAME_MAX, SLOTS_MAX, eventNameLength, slotProblems, type SlotProblem } from '../../shared/event'
import { berlinToUtc, utcToBerlin } from '../../shared/time'
import { parseSessionCount } from './session'

// Event input rules for creating an Event (#1 § Domain rules, #49). Times arrive as Berlin wall-clock
// values (`YYYY-MM-DDTHH:mm`, ADR 0003) and are stored as UTC instants.

export type EventInputError
  = 'invalid_name' | 'invalid_mode' | 'invalid_sessions' | 'invalid_slots' | 'invalid_time'
    | 'too_few_slots' | 'in_past' | 'duplicate_slot' | 'duplicate_date'

/** A new Event with `sessions` Sessions. Poll Sessions wait for a Date from the Slots; direct ones get one Date each. */
export type NewEvent
  = { dateMode: 'poll', name: string, sessions: number, slots: Date[] }
    | { dateMode: 'direct', name: string, sessions: number, startsAt: Date[] }

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** The Event name: trimmed, 1 to 60 characters (emoji count as one). Null when invalid. */
export function parseEventName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const length = eventNameLength(raw)
  return length >= 1 && length <= EVENT_NAME_MAX ? raw.trim() : null
}

export type SlotError = EventInputError | 'slots_max'

/** A Berlin wall-clock value as an instant. Null for text that is not a real time, such as 30 Feb or a skipped DST hour. */
export function parseLocalTime(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !LOCAL_TIME.test(raw)) return null
  const instant = berlinToUtc(raw)
  return utcToBerlin(instant) === raw ? instant : null
}

/**
 * The first Slot rule a request breaks (shared/event.ts slotProblems), shared by create and the
 * Host's edits. A Slot in the past is named before a duplicate.
 */
function slotRuleError(proposed: Date[], existing: Date[], now: Date): SlotProblem | null {
  const problems = slotProblems(proposed, existing, now)
  if (problems.includes('in_past')) return 'in_past'
  return problems.includes('duplicate_slot') ? 'duplicate_slot' : null
}

/** Validates a Slot the Host adds to a Date poll. `existing` are the Event's Slots as they are now. */
export function parseAddedSlot(raw: unknown, existing: Date[], now: Date): { ok: true, startsAt: Date } | { ok: false, error: SlotError } {
  if (existing.length >= SLOTS_MAX) return { ok: false, error: 'slots_max' }
  const startsAt = parseLocalTime(raw)
  if (!startsAt) return { ok: false, error: 'invalid_time' }
  const problem = slotRuleError([startsAt], existing, now)
  return problem ? { ok: false, error: problem } : { ok: true, startsAt }
}

/**
 * Validates what the create form sends (#49): a name, the date mode, the Session count (1 to 8) and
 * either the Slots (at least one per Session, at most 8, all in the future and unique per minute) or
 * one Date per Session (in the future and distinct). `now` is injected so the rules can be tested.
 */
export function parseNewEvent(input: unknown, now: Date): { ok: true, event: NewEvent } | { ok: false, error: EventInputError } {
  const body = (input ?? {}) as { name?: unknown, dateMode?: unknown, sessions?: unknown, slots?: unknown, startsAt?: unknown }
  const name = parseEventName(body.name)
  if (!name) return { ok: false, error: 'invalid_name' }
  if (body.dateMode !== 'poll' && body.dateMode !== 'direct') return { ok: false, error: 'invalid_mode' }
  // A request without a Session count makes an Event with one Session, as before #49.
  const sessions = parseSessionCount(body.sessions ?? 1)
  if (sessions === null) return { ok: false, error: 'invalid_sessions' }

  if (body.dateMode === 'direct') {
    if (!Array.isArray(body.startsAt) || body.startsAt.length !== sessions) return { ok: false, error: 'invalid_time' }
    const startsAt = body.startsAt.map(parseLocalTime)
    if (startsAt.some(date => date === null)) return { ok: false, error: 'invalid_time' }
    const dates = startsAt as Date[]
    if (dates.some(date => date <= now)) return { ok: false, error: 'in_past' }
    if (new Set(dates.map(date => date.getTime())).size !== dates.length) return { ok: false, error: 'duplicate_date' }
    return { ok: true, event: { dateMode: 'direct', name, sessions, startsAt: dates } }
  }

  if (!Array.isArray(body.slots) || body.slots.length < 1 || body.slots.length > SLOTS_MAX) {
    return { ok: false, error: 'invalid_slots' }
  }
  const slots = body.slots.map(parseLocalTime)
  if (slots.some(slot => slot === null)) return { ok: false, error: 'invalid_time' }
  const instants = slots as Date[]
  if (instants.length < sessions) return { ok: false, error: 'too_few_slots' }
  const problem = slotRuleError(instants, [], now)
  if (problem) return { ok: false, error: problem }
  return { ok: true, event: { dateMode: 'poll', name, sessions, slots: instants } }
}
