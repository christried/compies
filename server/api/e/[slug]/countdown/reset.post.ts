import { defineEventHandler } from 'h3'
import { useClock } from '../../../../utils/clock'
import { changeEvent } from '../../../../utils/event-access'
import { resetCountdown } from '../../../../utils/countdown'
import type { CountdownView } from '../../../../../shared/event'

// The Host resets the Countdown to its full duration, not running (#236, spec #218 § Countdown). The room hears
// `countdown.changed`; the client refetches the Event read.
export default defineEventHandler((event): Promise<CountdownView> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => resetCountdown(change, useClock(event).now())))
