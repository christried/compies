import { readBody, type H3Event } from 'h3'
import type { PhaseRejection } from '../domain/phase'
import { parseLocalTime } from '../domain/session'
import { apiError } from './errors'

/**
 * The new Date a Set Date or Reschedule request carries (`startsAt` as a Berlin `YYYY-MM-DDTHH:mm`,
 * ADR 0003), after the phase rule: 400 invalid_time for text that is no Berlin time, then the rule's
 * own refusal (409 wrong_phase, 400 in_past).
 */
export async function readNewDate(event: H3Event, rejection: (startsAt: Date) => PhaseRejection | null): Promise<Date> {
  const body = await readBody<{ startsAt?: unknown } | null>(event)
  const startsAt = parseLocalTime(body?.startsAt)
  if (!startsAt) throw apiError('invalid_time')
  const refused = rejection(startsAt)
  if (refused) throw apiError(refused)
  return startsAt
}
