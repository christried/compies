import { SESSION_NAME_MAX, SLOTS_MAX } from '../../shared/session'
import { berlinToUtc, utcToBerlin } from './time'

// Session input rules for creating a Session (#1 § Domain rules). Times arrive as Berlin wall-clock
// values (`YYYY-MM-DDTHH:mm`, ADR 0003) and are stored as UTC instants.

export type SessionInputError = 'invalid_name' | 'invalid_mode' | 'invalid_slots' | 'invalid_time' | 'in_past' | 'duplicate_slot'

export type NewSession = { dateMode: 'poll', name: string, slots: Date[] } | { dateMode: 'direct', name: string, startsAt: Date }

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** The Session name: trimmed, 1 to 60 characters (emoji count as one). Null when invalid. */
export function parseSessionName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  const length = [...name].length
  return length >= 1 && length <= SESSION_NAME_MAX ? name : null
}

/** A Berlin wall-clock value as an instant. Null for text that is not a real time, such as 30 Feb or a skipped DST hour. */
export function parseLocalTime(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !LOCAL_TIME.test(raw)) return null
  const instant = berlinToUtc(raw)
  return utcToBerlin(instant) === raw ? instant : null
}

/**
 * Validates what the create form sends. Slots must lie in the future and be unique per minute.
 * `now` is injected so the rule can be tested at a fixed moment.
 */
export function parseNewSession(input: unknown, now: Date): { ok: true, session: NewSession } | { ok: false, error: SessionInputError } {
  const body = (input ?? {}) as { name?: unknown, dateMode?: unknown, slots?: unknown, startsAt?: unknown }
  const name = parseSessionName(body.name)
  if (!name) return { ok: false, error: 'invalid_name' }

  if (body.dateMode === 'direct') {
    const startsAt = parseLocalTime(body.startsAt)
    if (!startsAt) return { ok: false, error: 'invalid_time' }
    if (startsAt <= now) return { ok: false, error: 'in_past' }
    return { ok: true, session: { dateMode: 'direct', name, startsAt } }
  }

  if (body.dateMode !== 'poll') return { ok: false, error: 'invalid_mode' }
  if (!Array.isArray(body.slots) || body.slots.length < 1 || body.slots.length > SLOTS_MAX) {
    return { ok: false, error: 'invalid_slots' }
  }
  const slots = body.slots.map(parseLocalTime)
  if (slots.some(slot => slot === null)) return { ok: false, error: 'invalid_time' }
  const instants = slots as Date[]
  if (instants.some(slot => slot <= now)) return { ok: false, error: 'in_past' }
  if (new Set(instants.map(slot => slot.getTime())).size !== instants.length) return { ok: false, error: 'duplicate_slot' }
  return { ok: true, session: { dateMode: 'poll', name, slots: instants } }
}
