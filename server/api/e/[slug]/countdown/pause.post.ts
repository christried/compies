import { defineEventHandler } from 'h3'
import { useClock } from '../../../../utils/clock'
import { changeEvent } from '../../../../utils/event-access'
import { pauseCountdown } from '../../../../utils/countdown'
import type { CountdownView } from '../../../../../shared/event'

// The Host pauses the running Countdown (#236, spec #218 § Countdown): it keeps the time it has left. Refused by the rules of
// shared/countdown.ts. The room hears `countdown.changed`; the client refetches the Event read.
export default defineEventHandler((event): Promise<CountdownView> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => pauseCountdown(change, useClock(event).now())))
