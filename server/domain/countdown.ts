import { asRecord } from '../../shared/record'
import { COUNTDOWN_MAX_S, COUNTDOWN_MIN_S } from '../../shared/countdown'

// What the Host sends to set the Countdown (#236, spec #218 § Countdown): `{ seconds }`, a whole number from 5 to 5999 (99:59).
// Anything else is `invalid_value`, the same answer as for every other bad number of the Event API.

export function parseSetCountdown(body: unknown): { ok: true, seconds: number } | { ok: false, error: 'invalid_value' } {
  const { seconds } = asRecord(body)
  return typeof seconds === 'number' && Number.isInteger(seconds) && seconds >= COUNTDOWN_MIN_S && seconds <= COUNTDOWN_MAX_S
    ? { ok: true, seconds }
    : { ok: false, error: 'invalid_value' }
}
