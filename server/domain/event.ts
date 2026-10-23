import { EVENT_NAME_MAX, SLOTS_MAX, eventNameLength, slotProblems, type Phase, type SlotProblem } from '../../shared/event'
import { berlinToUtc, utcToBerlin } from '../../shared/time'

// Event input rules for creating an Event (#1 § Domain rules). Times arrive as Berlin wall-clock
// values (`YYYY-MM-DDTHH:mm`, ADR 0003) and are stored as UTC instants.

export type EventInputError = 'invalid_name' | 'invalid_mode' | 'invalid_slots' | 'invalid_time' | 'in_past' | 'duplicate_slot'

export type NewEvent = { dateMode: 'poll', name: string, slots: Date[] } | { dateMode: 'direct', name: string, startsAt: Date }

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

/** Slots can be added, removed and only then changed by the Host while the Date poll is open (#1). */
export function slotsEditable(phase: Phase): boolean {
  return phase === 'poll'
}

/**
 * Validates what the create form sends. Slots must lie in the future and be unique per minute.
 * `now` is injected so the rule can be tested at a fixed moment.
 */
export function parseNewEvent(input: unknown, now: Date): { ok: true, event: NewEvent } | { ok: false, error: EventInputError } {
  const body = (input ?? {}) as { name?: unknown, dateMode?: unknown, slots?: unknown, startsAt?: unknown }
  const name = parseEventName(body.name)
  if (!name) return { ok: false, error: 'invalid_name' }

  if (body.dateMode === 'direct') {
    const startsAt = parseLocalTime(body.startsAt)
    if (!startsAt) return { ok: false, error: 'invalid_time' }
    if (startsAt <= now) return { ok: false, error: 'in_past' }
    return { ok: true, event: { dateMode: 'direct', name, startsAt } }
  }

  if (body.dateMode !== 'poll') return { ok: false, error: 'invalid_mode' }
  if (!Array.isArray(body.slots) || body.slots.length < 1 || body.slots.length > SLOTS_MAX) {
    return { ok: false, error: 'invalid_slots' }
  }
  const slots = body.slots.map(parseLocalTime)
  if (slots.some(slot => slot === null)) return { ok: false, error: 'invalid_time' }
  const instants = slots as Date[]
  const problem = slotRuleError(instants, [], now)
  if (problem) return { ok: false, error: problem }
  return { ok: true, event: { dateMode: 'poll', name, slots: instants } }
}
