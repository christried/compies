import { defineEventHandler } from 'h3'
import { parseSetCountdown } from '../../../../domain/countdown'
import { apiError } from '../../../../utils/errors'
import { useClock } from '../../../../utils/clock'
import { changeEvent } from '../../../../utils/event-access'
import { setCountdown } from '../../../../utils/countdown'
import type { CountdownView } from '../../../../../shared/event'

// The Host sets the Countdown (#236, spec #218 § Countdown): `{ seconds }` from 5 to 5999, ready at its full duration. The room
// hears `countdown.changed` without any payload and the client refetches the Event read.
export default defineEventHandler((event): Promise<CountdownView> => changeEvent(event, { hostOnly: true, lock: 'update' }, async (change) => {
  const parsed = parseSetCountdown(change.body)
  if (!parsed.ok) throw apiError(parsed.error)
  return await setCountdown(change, useClock(event).now(), parsed.seconds)
}))
